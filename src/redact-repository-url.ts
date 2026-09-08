import type { ResolvedOptions } from './semantic-release-shapes.js';

/**
 * Returns `options` with `repositoryUrl` swapped back to the credential-free original.
 *
 * `run()` (semantic-release's own internal step sequence) overwrites `options.repositoryUrl` with a credential-embedded push URL from `getGitAuthUrl` -- e.g. `https://x-access-token:${GITHUB_TOKEN}@github.com/...` -- so `git push`/`git tag` can authenticate non-interactively in CI. Before that mutation happens, semantic-release's own outer function stashes the original, credential-free URL as `options.originalRepositoryURL`. `ReleaseGateState` is designed to be persisted and cross a process or CI-job boundary (a file, a CI artifact), so it must never carry the credential-bearing form -- this function is the one place that guarantee is enforced, called exactly once, right before `detachRelease` builds the state it returns.
 */
export function redactRepositoryUrl(options: ResolvedOptions & { readonly originalRepositoryURL: string }): ResolvedOptions {
  const { originalRepositoryURL, ...rest } = options;
  return { ...rest, repositoryUrl: originalRepositoryURL };
}
