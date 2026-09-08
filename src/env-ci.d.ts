/**
 * Ambient type declaration for `env-ci`, a real (non-deep-import) runtime dependency this package needs directly: `detachRelease` reimplements semantic-release's own `run()`, which reads `envCi({env, cwd})`'s `isCi`/`branch`/`prBranch`/`isPr` fields to decide dry-run fallback and pull-request skipping. `env-ci` ships no types of its own, and the community `@types/env-ci` package on npm is pinned to env-ci's old v3 API shape, well behind the v11 major this package depends on -- hand-written against the real installed `env-ci@11.2.0` source (`index.js`'s own per-service `configuration()` return, and the plain, non-CI `git` fallback service) rather than pulling in a mismatched community package.
 */
declare module 'env-ci' {
  export interface EnvCiResult {
    readonly isCi: boolean;
    readonly branch?: string;
    readonly prBranch?: string;
    readonly isPr?: boolean;
    readonly [field: string]: unknown;
  }

  export default function envCi(options?: { readonly env?: NodeJS.ProcessEnv; readonly cwd?: string }): EnvCiResult;
}
