import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Commit, PluginSpec } from 'semantic-release';

/**
 * A disposable git repository with a real bare remote, for exercising `detachRelease`/`resumeRelease` against real git state -- real tags, real commits, a real `file://` push target -- rather than a mocked one. Modelled on `@exadev/semantic-release-workspace`'s `git-workspace-fixture.ts` and `@exadev/build-identity`'s `test-repo.ts`.
 */
export interface GitFixtureRepo {
  readonly root: string;
  readonly remote: string;
  /** Removes the working tree and the bare remote from disk. Always call this, even when a test fails. */
  readonly remove: () => Promise<void>;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

export async function createGitFixtureRepo(): Promise<GitFixtureRepo> {
  const directory = await mkdtemp(join(tmpdir(), 'release-gate-test-'));
  const root = join(directory, 'repo');
  const remote = join(directory, 'remote.git');

  await mkdir(root, { recursive: true });
  git(root, ['init', '--initial-branch=main']);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', remote]);
  git(root, ['config', 'user.name', 'release-gate tests']);
  git(root, ['config', 'user.email', 'release-gate-tests@example.invalid']);
  // tag.gpgsign false: this machine's global git config signs every tag by default, which needs a GPG agent and turns a plain lightweight tag into an annotated one requiring a message -- neither of which a disposable test fixture, or detachRelease's own real `git tag` call, should depend on.
  git(root, ['config', 'tag.gpgsign', 'false']);

  await writeFile(join(root, 'README.md'), '# fixture\n');
  git(root, ['add', '--', 'README.md']);
  git(root, ['commit', '-m', 'chore: scaffold repository']);

  // The remote is registered as a file:// URL rather than a bare path: semantic-release parses repositoryUrl with git-url-parse, which rejects plain filesystem paths, and every git operation (ls-remote, fetch, push) treats the two identically.
  git(root, ['remote', 'add', 'origin', pathToFileURL(remote).href]);
  git(root, ['push', '-u', 'origin', 'main']);

  return {
    root,
    remote,
    // maxRetries/retryDelay: `git push`/`git commit` can leave a background `git gc --auto` still writing into `remote.git/objects` or `.git/objects` for a moment after the command that triggered it returns, which occasionally loses the race against this recursive delete with ENOTEMPTY.
    remove: async () => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}

/**
 * Commits a new file to the fixture repository's working tree, moving `main` forward. Deliberately never pushes: `detachRelease`'s own real `getCommits`/`analyzeCommits`/`getBranches` steps all read local git state (`git log`, `git tag --merged`), exactly like a real CI checkout with unpushed release commits already merged in -- only detachRelease's own `push`/`pushNotes` calls, and this package's own `resumeRelease`, ever touch the remote. Returns the new commit's full SHA.
 */
export async function commitFile(root: string, relativePath: string, content: string, message: string): Promise<string> {
  await writeFile(join(root, relativePath), content);
  git(root, ['add', '--', relativePath]);
  git(root, ['commit', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']);
}

/** Every tag reachable from `main` in the fixture's bare remote, for asserting a tag genuinely reached the remote and not just the local working tree. */
export function listRemoteTags(remote: string): readonly string[] {
  return execFileSync('git', ['tag'], { cwd: remote, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface RecordedPublishCall {
  readonly nextRelease: { readonly version: string; readonly gitTag: string };
}

export interface RecordingPluginCalls {
  readonly publish: RecordedPublishCall[];
  readonly success: RecordedPublishCall[];
  readonly fail: unknown[];
}

/**
 * A real semantic-release plugin, in the inline-object form `semantic-release/lib/plugins/index.js` supports directly (`options.plugins` can hold a plain object of step functions with no `path`, resolved with no file I/O or dynamic import at all -- see `parseConfig`/`loadPlugin` in `semantic-release/lib/plugins/utils.js`). Provides a minimal, real `analyzeCommits` (conventional-commit `feat`/`fix` prefixes only) so tests never need `@semantic-release/commit-analyzer` as a runtime dependency, and records every `publish`/`success`/`fail` call so a test can assert these did or didn't run without touching npm or GitHub.
 */
export function createRecordingPlugin(): { readonly plugin: Record<string, unknown>; readonly calls: RecordingPluginCalls } {
  const calls: RecordingPluginCalls = { publish: [], success: [], fail: [] };

  const plugin = {
    analyzeCommits(_pluginConfig: unknown, context: { readonly commits: readonly Commit[] }): 'minor' | 'patch' | undefined {
      const types = context.commits.map((commit) => classifyCommit(commit.subject));
      if (types.includes('minor')) {
        return 'minor';
      }
      if (types.includes('patch')) {
        return 'patch';
      }
      return undefined;
    },
    generateNotes(): string {
      return 'Release notes.';
    },
    publish(_pluginConfig: unknown, context: RecordedPublishCall): { readonly name: string } {
      calls.publish.push(context);
      return { name: `recorded-release-${context.nextRelease.version}` };
    },
    success(_pluginConfig: unknown, context: RecordedPublishCall): void {
      calls.success.push(context);
    },
    fail(_pluginConfig: unknown, context: unknown): void {
      calls.fail.push(context);
    },
  };

  return { plugin, calls };
}

/**
 * `createRecordingPlugin()`'s `plugin` is a real, runtime-supported semantic-release plugin spec -- an inline object of step functions, resolved with no file I/O at all (confirmed directly in `semantic-release/lib/plugins/utils.js`'s `parseConfig`: a plain object with no `.path` falls through to `path = plugin` and is used as-is). semantic-release's own public `PluginSpec` type (`string | [string, T]`) simply doesn't capture that form -- a confirmed gap in the published types, not a defect in this package. This cast bridges that one gap in one place, so test files constructing `cliOptions.plugins` never need their own unjustified `as`.
 */
export function asPluginSpec(plugin: Record<string, unknown>): PluginSpec {
  return plugin as unknown as PluginSpec;
}

function classifyCommit(subject: string): 'minor' | 'patch' | undefined {
  if (/^feat(\(|:)/.test(subject)) {
    return 'minor';
  }
  if (/^fix(\(|:)/.test(subject)) {
    return 'patch';
  }
  return undefined;
}
