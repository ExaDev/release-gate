import type { Release } from 'semantic-release';
import getGitAuthUrl from 'semantic-release/lib/get-git-auth-url.js';
import getLogger from 'semantic-release/lib/get-logger.js';
import { extractErrors } from 'semantic-release/lib/utils.js';
import { ReleaseGateStateError } from './errors.js';
import { isReleaseGateState } from './is-release-gate-state.js';
import { rebuildPublishPipeline } from './rebuild-publish-pipeline.js';

export interface ResumeReleaseEnv {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
}

function isSemanticReleaseError(value: unknown): value is { readonly semanticRelease: true } {
  return typeof value === 'object' && value !== null && 'semanticRelease' in value && value.semanticRelease === true;
}

/**
 * Finishes a release `detachRelease` already tagged and pushed: rebuilds the real `publish`/`success` plugin pipeline from the persisted state and runs it, exactly mirroring semantic-release's own real call sites (`const releases = await plugins.publish(context); await plugins.success({...context, releases})`).
 *
 * `state` typically arrives from outside this process -- a file, a CI artifact -- so it's accepted as `unknown` and runtime-validated, the same as any other `JSON.parse` boundary; a state this package didn't produce, or one from an incompatible `schemaVersion`, throws `ReleaseGateStateError` rather than failing deep inside a deep-imported semantic-release internal with a confusing error.
 *
 * `cwd`/`env`/`stdout`/`stderr` are always freshly built for this call, never read out of `state`: a resume can run in an entirely different process or CI job than the one that ran `detachRelease`, with different credentials and a different logger destination. In particular, the push/pull URL is re-derived from this process's own `env` via `getGitAuthUrl` -- `state.options.repositoryUrl` is deliberately the credential-free original (see `redact-repository-url.ts`), not something this function can push with directly.
 */
export async function resumeRelease(state: unknown, execEnv: ResumeReleaseEnv = {}): Promise<readonly Release[]> {
  if (!isReleaseGateState(state)) {
    throw new ReleaseGateStateError(
      'The value passed to resumeRelease is not a valid ReleaseGateState -- either malformed, or from an incompatible schemaVersion this version of @exadev/release-gate does not understand.',
    );
  }

  const cwd = execEnv.cwd ?? process.cwd();
  const env = execEnv.env ?? process.env;
  const stdout = execEnv.stdout ?? process.stdout;
  const stderr = execEnv.stderr ?? process.stderr;
  const logger = getLogger({ stdout, stderr });

  const repositoryUrl = await getGitAuthUrl({ cwd, env, options: state.options, branch: state.branch });
  const options = { ...state.options, repositoryUrl };

  const plugins = await rebuildPublishPipeline({ cwd, env, options, logger, pluginsPath: state.pluginsPath });

  const context = {
    cwd,
    env,
    stdout,
    stderr,
    logger,
    options,
    branches: state.branches,
    branch: state.branch,
    lastRelease: state.lastRelease,
    commits: state.commits,
    nextRelease: state.nextRelease,
  };

  try {
    const releases = await plugins.publish(context);
    await plugins.success({ ...context, releases });
    logger.success(
      `Published release ${state.nextRelease.version} on ${state.nextRelease.channel ?? 'default'} channel`,
    );
    return releases;
  } catch (error) {
    const semanticReleaseErrors = extractErrors(error).filter(isSemanticReleaseError);
    if (semanticReleaseErrors.length > 0) {
      await plugins.fail({ ...context, errors: semanticReleaseErrors });
    }
    throw error;
  }
}
