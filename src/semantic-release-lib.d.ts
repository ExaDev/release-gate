/**
 * Ambient type declarations for semantic-release's internal modules -- everything under `semantic-release/lib/*`. None of this is public API: `semantic-release`'s own `package.json` declares no `exports` field (so nothing blocks a deep import from resolving), but only the package's single default export carries a semver guarantee. These types are hand-written against the exact `semantic-release@25.0.9` source this package pins as a direct dependency -- see `detach-release.ts`'s own doc comment for why that pin is exact, not a caret range.
 *
 * Named `semantic-release-lib.d.ts` rather than `semantic-release-internals.d.ts` deliberately: TypeScript treats a `.ts` and a `.d.ts` file sharing one base name in the same directory as a paired implementation/declaration pair, not two independent modules.
 *
 * This file deliberately has NO top-level `import`/`export` statement, keeping it a global script rather than a module. That is load-bearing, not stylistic: `semantic-release`'s own `lib/*.js` files genuinely exist on disk (this package depends on `semantic-release` directly), so TypeScript's module resolution finds a real, typeless `.js` file for a specifier like `semantic-release/lib/get-config.js` before it would ever consult a `declare module` block written inside a module file -- confirmed directly, a `declare module` for a resolvable real file is silently ignored once the containing `.d.ts` has any top-level `import`/`export` of its own. Written as a global script instead, every `declare module` block below is a genuine ambient module augmentation, applied program-wide regardless of that real file's own lack of types.
 *
 * The shared shapes below (`GateLogger`, `ResolvedOptions`, `PluginPipeline`, `ResolvedBranch`) are genuine exported types from `semantic-release-shapes.ts`, referenced here via a local, non-exported `import(...)` type alias rather than a top-level `import` -- for the same reason as above -- so this file's own ambient declarations stay in sync with the one real definition every other source file in the package imports normally. Confirmed the hard way: an earlier version of this file declared these as bare *global* interfaces instead (no backing module at all), which worked for every file inside this package but silently broke `tsdown`'s declaration bundling for the published `dist/index.d.ts` -- a bundler traces and inlines types reachable through real imports, not stray global ambient declarations nothing imports.
 */

type SemanticReleaseOptions = import('semantic-release').Options;
type GateLogger = import('./semantic-release-shapes.js').GateLogger;
type ResolvedOptions = import('./semantic-release-shapes.js').ResolvedOptions;
type PluginPipeline = import('./semantic-release-shapes.js').PluginPipeline;
type ResolvedBranch = import('./semantic-release-shapes.js').ResolvedBranch;

declare module 'semantic-release/lib/get-config.js' {
  export default function getConfig(
    context: {
      readonly cwd: string;
      readonly env: NodeJS.ProcessEnv;
      readonly stdout: NodeJS.WritableStream;
      readonly stderr: NodeJS.WritableStream;
      readonly logger: GateLogger;
    },
    cliOptions: SemanticReleaseOptions,
  ): Promise<{ readonly options: ResolvedOptions; readonly plugins: PluginPipeline }>;
}

declare module 'semantic-release/lib/plugins/index.js' {
  export default function buildPluginPipeline(
    context: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly options: ResolvedOptions; readonly logger: GateLogger },
    pluginsPath: Readonly<Record<string, string>>,
  ): Promise<PluginPipeline>;
}

declare module 'semantic-release/lib/verify.js' {
  export default function verify(context: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly options: ResolvedOptions;
  }): Promise<void>;
}

declare module 'semantic-release/lib/get-git-auth-url.js' {
  export default function getGitAuthUrl(context: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly options: ResolvedOptions;
    readonly branch: { readonly name: string };
  }): Promise<string>;
}

declare module 'semantic-release/lib/branches/index.js' {
  export default function getBranches(
    repositoryUrl: string,
    ciBranch: string,
    context: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly options: ResolvedOptions },
  ): Promise<readonly ResolvedBranch[]>;
}

declare module 'semantic-release/lib/get-release-to-add.js' {
  /** Truthy only on the maintenance-branch backport/`addChannel` path this package deliberately doesn't support -- `detachRelease` throws `ReleaseGateConfigurationError` rather than handle it. The real return shape (`{lastRelease, currentRelease, nextRelease}`) is never consumed here, only its truthiness. */
  export default function getReleaseToAdd(context: {
    readonly branch: ResolvedBranch;
    readonly branches: readonly ResolvedBranch[];
    readonly options: ResolvedOptions;
  }): unknown;
}

declare module 'semantic-release/lib/get-last-release.js' {
  export default function getLastRelease(
    context: { readonly branch: ResolvedBranch; readonly options: ResolvedOptions },
    params?: { readonly before?: string },
  ): Partial<import('semantic-release').LastRelease>;
}

declare module 'semantic-release/lib/get-commits.js' {
  export default function getCommits(context: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly lastRelease: Partial<import('semantic-release').LastRelease>;
    readonly nextRelease?: { readonly gitHead?: string };
    readonly logger: GateLogger;
  }): Promise<readonly import('semantic-release').Commit[]>;
}

declare module 'semantic-release/lib/get-next-version.js' {
  export default function getNextVersion(context: {
    readonly branch: ResolvedBranch;
    readonly nextRelease: { readonly type: string; readonly channel: string | false | null };
    readonly lastRelease: Partial<import('semantic-release').LastRelease>;
    readonly logger: GateLogger;
  }): string;
}

declare module 'semantic-release/lib/get-logger.js' {
  export default function getLogger(context: { readonly stdout: NodeJS.WritableStream; readonly stderr: NodeJS.WritableStream }): GateLogger;
}

declare module 'semantic-release/lib/get-error.js' {
  export default function getError(
    code: string,
    context?: unknown,
  ): Error & { readonly code?: string; readonly details?: string; readonly semanticRelease?: boolean };
}

declare module 'semantic-release/lib/utils.js' {
  export function extractErrors(err: unknown): readonly unknown[];
  export function makeTag(tagFormat: string, version: string): string;
}

declare module 'semantic-release/lib/definitions/constants.js' {
  export const COMMIT_NAME: string;
  export const COMMIT_EMAIL: string;
  export const RELEASE_TYPE: readonly ['patch', 'minor', 'major'];
}

declare module 'semantic-release/lib/git.js' {
  export function tag(tagName: string, ref: string, execaOptions: { readonly cwd: string; readonly env: NodeJS.ProcessEnv }): Promise<void>;
  export function push(repositoryUrl: string, execaOptions: { readonly cwd: string; readonly env: NodeJS.ProcessEnv }): Promise<void>;
  export function pushNotes(
    repositoryUrl: string,
    ref: string,
    execaOptions: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
  ): Promise<void>;
  export function addNote(
    note: { readonly channels: readonly (string | false | null)[] },
    ref: string,
    execaOptions: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
  ): Promise<void>;
  export function getGitHead(execaOptions: { readonly cwd: string; readonly env: NodeJS.ProcessEnv }): Promise<string>;
  export function getTagHead(tagName: string, execaOptions: { readonly cwd: string; readonly env: NodeJS.ProcessEnv }): Promise<string>;
  export function verifyAuth(
    repositoryUrl: string,
    branch: string,
    execaOptions: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
  ): Promise<void>;
  export function isBranchUpToDate(
    repositoryUrl: string,
    branch: string,
    execaOptions: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
  ): Promise<boolean>;
}
