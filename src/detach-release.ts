import envCi from 'env-ci';
import semver from 'semver';
import type { Options, ReleaseType } from 'semantic-release';
import getConfig from 'semantic-release/lib/get-config.js';
import verify from 'semantic-release/lib/verify.js';
import getGitAuthUrl from 'semantic-release/lib/get-git-auth-url.js';
import getBranches from 'semantic-release/lib/branches/index.js';
import getReleaseToAdd from 'semantic-release/lib/get-release-to-add.js';
import getLastRelease from 'semantic-release/lib/get-last-release.js';
import getCommits from 'semantic-release/lib/get-commits.js';
import getNextVersion from 'semantic-release/lib/get-next-version.js';
import getLogger from 'semantic-release/lib/get-logger.js';
import getError from 'semantic-release/lib/get-error.js';
import { makeTag } from 'semantic-release/lib/utils.js';
import { COMMIT_EMAIL, COMMIT_NAME, RELEASE_TYPE } from 'semantic-release/lib/definitions/constants.js';
import { addNote, getGitHead, getTagHead, isBranchUpToDate, push, pushNotes, tag, verifyAuth } from 'semantic-release/lib/git.js';
import { ReleaseGateConfigurationError } from './errors.js';
import { redactRepositoryUrl } from './redact-repository-url.js';
import type { ResolvedOptions } from './semantic-release-shapes.js';
import type { ReleaseGateState } from './types.js';

const RELEASE_TYPES = new Set<string>(RELEASE_TYPE);

export interface DetachReleaseEnv {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
}

function isReleaseType(value: string | false | undefined): value is ReleaseType {
  return typeof value === 'string' && RELEASE_TYPES.has(value);
}

function isExecaLikeError(value: unknown): value is { readonly command: string; readonly stderr: string } {
  return typeof value === 'object' && value !== null && 'command' in value && 'stderr' in value;
}

/**
 * Runs semantic-release's own release logic up through creating and pushing the release tag -- verify config, resolve the branch, verify push auth, `verifyConditions`, analyze commits, `verifyRelease`, `generateNotes`, `prepare`, then `tag`+`push` -- and stops there, before `publish`/`success` ever run. Reimplements the body of semantic-release's internal `run()` (there is no exported seam to hook into: `semantic-release`'s only public export is the single default function that runs a release start to finish) rather than wrapping it, using the same deep `semantic-release/lib/*` imports `run()` itself uses internally -- none of these carry a semver guarantee, which is why this package pins an exact `semantic-release` version (see `package.json`) rather than a caret range, and why `semantic-release-lib.d.ts` hand-types every one of them against that exact pinned source.
 *
 * The signature deliberately mirrors semantic-release's own default export, so a caller can swap `semanticRelease(cliOptions, execEnv)` for `detachRelease(cliOptions, execEnv)` with no other code change.
 *
 * Returns `null` whenever semantic-release's own `run()` would have returned `false` before publishing -- no CI, a pull-request run, a branch semantic-release isn't configured to release from, a behind-remote branch, no releasable commits, or dry-run mode (a dry run never tags, so there is nothing to resume). Returns a `ReleaseGateState` once the tag genuinely exists and has been pushed, ready to hand to `resumeRelease`.
 *
 * Deliberately does not wrap stdout/stderr for secret redaction the way semantic-release's own default export does (`hookStd(..., hideSensitive(env))`) -- see the README's "What this package does not do" section.
 */
export async function detachRelease(cliOptions: Options = {}, execEnv: DetachReleaseEnv = {}): Promise<ReleaseGateState | null> {
  if (cliOptions.extends !== undefined) {
    throw new ReleaseGateConfigurationError(
      "detachRelease does not support 'extends' (shareable configuration): semantic-release's own getConfig never exposes the pluginsPath map it builds internally to resolve one, so this package can't reconstruct plugin resolution from a shareable config at resume time. See the README's 'What this package does not do' section.",
    );
  }

  const cwd = execEnv.cwd ?? process.cwd();
  const env = execEnv.env ?? process.env;
  const stdout = execEnv.stdout ?? process.stdout;
  const stderr = execEnv.stderr ?? process.stderr;
  const logger = getLogger({ stdout, stderr });
  const ci = envCi({ env, cwd });

  const { plugins, options: configuredOptions } = await getConfig({ cwd, env, stdout, stderr, logger }, cliOptions);
  const originalRepositoryURL = configuredOptions.repositoryUrl;

  const { isCi, branch: ciDefaultBranch, prBranch, isPr } = ci;
  const ciBranch = isPr === true ? prBranch : ciDefaultBranch;

  if (ciBranch === undefined) {
    logger.log('Could not determine the current branch from the CI environment, therefore a new version will not be published.');
    return null;
  }

  let options: ResolvedOptions = configuredOptions;
  let releaseEnv = env;

  if (!isCi && options.dryRun !== true && options.noCi !== true) {
    logger.warn('This run was not triggered in a known CI environment, running in dry-run mode.');
    options = { ...options, dryRun: true };
  } else {
    releaseEnv = {
      GIT_AUTHOR_NAME: COMMIT_NAME,
      GIT_AUTHOR_EMAIL: COMMIT_EMAIL,
      GIT_COMMITTER_NAME: COMMIT_NAME,
      GIT_COMMITTER_EMAIL: COMMIT_EMAIL,
      ...env,
      GIT_ASKPASS: 'echo',
      GIT_TERMINAL_PROMPT: '0',
    };
  }

  if (isCi && isPr === true && options.noCi !== true) {
    logger.log("This run was triggered by a pull request and therefore a new version won't be published.");
    return null;
  }

  await verify({ cwd, env: releaseEnv, options });

  options = { ...options, repositoryUrl: await getGitAuthUrl({ cwd, env: releaseEnv, options, branch: { name: ciBranch } }) };

  const branches = await getBranches(options.repositoryUrl, ciBranch, { cwd, env: releaseEnv, options });
  const branch = branches.find(({ name }) => name === ciBranch);

  if (!branch) {
    logger.log(
      `This run was triggered on the branch ${ciBranch}, while semantic-release is configured to only publish from ${branches.map(({ name }) => name).join(', ')}, therefore a new version won't be published.`,
    );
    return null;
  }

  logger[options.dryRun === true ? 'warn' : 'success'](
    `Run automated release from branch ${ciBranch} on repository ${originalRepositoryURL}${options.dryRun === true ? ' in dry-run mode' : ''}`,
  );

  try {
    try {
      await verifyAuth(options.repositoryUrl, branch.name, { cwd, env: releaseEnv });
    } catch (error) {
      if (!(await isBranchUpToDate(options.repositoryUrl, branch.name, { cwd, env: releaseEnv }))) {
        logger.log(`The local branch ${branch.name} is behind the remote one, therefore a new version won't be published.`);
        return null;
      }
      throw error;
    }
  } catch (error) {
    if (isExecaLikeError(error)) {
      logger.error(`The command "${error.command}" failed with the error message ${error.stderr}.`);
    }
    throw getError('EGITNOPERMISSION', { cwd, env: releaseEnv, options, branch });
  }

  logger.success('Allowed to push to the Git repository');

  const baseContext = { cwd, env: releaseEnv, options, logger, branch, branches };
  await plugins.verifyConditions(baseContext);

  if (getReleaseToAdd({ branch, branches, options }) !== undefined) {
    throw new ReleaseGateConfigurationError(
      "detachRelease does not support the maintenance-branch backport/addChannel path: adding an already-published release to a lower branch's channel is a structurally distinct flow from the main new-release flow this package targets. See the README's 'What this package does not do' section.",
    );
  }

  let lastRelease = getLastRelease({ branch, options });
  if (lastRelease.gitHead !== undefined) {
    lastRelease = { ...lastRelease, gitHead: await getTagHead(lastRelease.gitHead, { cwd, env: releaseEnv }) };
  }

  if (lastRelease.gitTag !== undefined && lastRelease.version !== undefined) {
    logger.log(`Found git tag ${lastRelease.gitTag} associated with version ${lastRelease.version} on branch ${branch.name}`);
  } else {
    logger.log(`No git tag version found on branch ${branch.name}`);
  }

  const commits = await getCommits({ cwd, env: releaseEnv, lastRelease, logger });

  const nextReleaseType = await plugins.analyzeCommits({ ...baseContext, lastRelease, commits });
  if (!isReleaseType(nextReleaseType)) {
    logger.log('There are no relevant changes, so no new version is released.');
    return null;
  }

  // Matches run()'s own `context.branch.channel || null` exactly -- a `channel: false` branch config (explicit default-channel opt-out) must fall through to `null` too, not survive as `false`, which is why this isn't a plain `?? null`.
  const channel = branch.channel === undefined || branch.channel === false ? null : branch.channel;
  const gitHead = await getGitHead({ cwd, env: releaseEnv });
  const version = getNextVersion({ branch, nextRelease: { type: nextReleaseType, channel }, lastRelease, logger });
  const gitTag = makeTag(options.tagFormat, version);

  if (branch.type !== 'prerelease' && !semver.satisfies(version, branch.range)) {
    throw getError('EINVALIDNEXTVERSION', {
      cwd,
      env: releaseEnv,
      options,
      logger,
      branch,
      branches,
      nextRelease: { type: nextReleaseType, version },
      validBranches: branches.filter((candidate) => candidate.type !== 'prerelease' && candidate.accept.includes(nextReleaseType)),
    });
  }

  const releaseContext = { ...baseContext, lastRelease, commits, nextRelease: { type: nextReleaseType, channel, gitHead, version, gitTag, name: gitTag } };
  await plugins.verifyRelease(releaseContext);

  const notes = await plugins.generateNotes(releaseContext);
  const nextRelease = { ...releaseContext.nextRelease, notes };

  await plugins.prepare({ ...releaseContext, nextRelease });

  if (options.dryRun === true) {
    logger.warn(`Skip ${nextRelease.gitTag} tag creation in dry-run mode`);
    return null;
  }

  // Create the tag before calling the publish plugins, as some require the tag to already exist -- resumeRelease is where those plugins actually run.
  await tag(nextRelease.gitTag, nextRelease.gitHead, { cwd, env: releaseEnv });
  await addNote({ channels: [nextRelease.channel] }, nextRelease.gitTag, { cwd, env: releaseEnv });
  await push(options.repositoryUrl, { cwd, env: releaseEnv });
  await pushNotes(options.repositoryUrl, nextRelease.gitTag, { cwd, env: releaseEnv });
  logger.success(`Created tag ${nextRelease.gitTag} and pushed it -- publish is deferred to resumeRelease`);

  return {
    schemaVersion: 1,
    options: redactRepositoryUrl({ ...options, originalRepositoryURL }),
    pluginsPath: {},
    branches,
    branch,
    lastRelease,
    commits,
    nextRelease,
  };
}
