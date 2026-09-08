import type { BranchSpec, Options, PluginSpec, Release, ReleaseType } from 'semantic-release';

/**
 * Real, reusable shapes semantic-release's own runtime uses but its public `index.d.ts` either doesn't export at all (`ResolvedBranch`, `PluginPipeline`, the logger) or exports in a pre-resolution form that doesn't match what actually flows through a release at runtime (`ResolvedOptions`, `ResolvedBranch` vs. the public `BranchObject`). Defined here, as genuine exported types, so both this package's own public API (`types.ts`'s `ReleaseGateState`) and its internal deep-import ambient declarations (`semantic-release-lib.d.ts`) share one definition -- the ambient file references these via a local, non-exported `import('./semantic-release-shapes.js').Foo` type alias rather than a top-level `import`, since a top-level import would turn it into a module and break its `declare module` blocks (see that file's own doc comment).
 */

/** The context object threaded through every step of a release run, as it exists at each point `detachRelease`/`resumeRelease` calls into these internals. Deliberately loose (`Record<string, unknown>` for nested option-like bags) where a function only reads a handful of fields off an otherwise free-form object -- tightened only where this package's own code actually depends on a field's shape. */
export interface GateLogger {
  readonly log: (message: string, ...args: readonly unknown[]) => void;
  readonly success: (message: string, ...args: readonly unknown[]) => void;
  readonly warn: (message: string, ...args: readonly unknown[]) => void;
  readonly error: (message: string, ...args: readonly unknown[]) => void;
  readonly scope: (...scopes: readonly string[]) => GateLogger;
  readonly scopeName: string;
}

export interface ResolvedOptions extends Options {
  readonly repositoryUrl: string;
  readonly tagFormat: string;
  readonly branches: readonly BranchSpec[];
  readonly plugins: readonly PluginSpec[];
  originalRepositoryURL?: string;
}

/** The pipeline of lifecycle-step functions `semantic-release/lib/plugins/index.js` assembles from a plugin list -- one entry per step, each already wrapped with validation/logging/dry-run handling. Every step's input/output is intentionally `unknown` here: each step's real input shape is a context variant this package builds by hand at each call site, not something worth re-deriving in this shared type. */
export interface PluginPipeline {
  readonly verifyConditions: (context: unknown) => Promise<void>;
  readonly analyzeCommits: (context: unknown) => Promise<string | false | undefined>;
  readonly verifyRelease: (context: unknown) => Promise<void>;
  readonly generateNotes: (context: unknown) => Promise<string | undefined>;
  readonly prepare: (context: unknown) => Promise<void>;
  readonly publish: (context: unknown) => Promise<readonly Release[]>;
  readonly addChannel: (context: unknown) => Promise<readonly Release[]>;
  readonly success: (context: unknown) => Promise<void>;
  readonly fail: (context: unknown) => Promise<void>;
}

export interface ResolvedBranchTag {
  readonly gitTag: string;
  readonly version: string;
  readonly channels: readonly (string | false | null)[];
}

interface ResolvedBranchBase {
  readonly name: string;
  readonly tags: readonly ResolvedBranchTag[];
}

/** A release-type branch (the default branch, or one of up to two others sharing its release history) -- e.g. `main`, `next`, `next-major`. */
export interface ResolvedReleaseBranch extends ResolvedBranchBase {
  readonly type: 'release';
  readonly channel?: string | false;
  readonly range: string;
  readonly accept: readonly ReleaseType[];
  /** `true` for the first (default) release branch. */
  readonly main: boolean;
}

/** A maintenance branch releasing an older major/minor line -- e.g. `1.x`, `2.2.x`. */
export interface ResolvedMaintenanceBranch extends ResolvedBranchBase {
  readonly type: 'maintenance';
  readonly channel: string | false;
  readonly range: string;
  readonly accept: readonly ReleaseType[];
  readonly mergeRange: string;
}

/** A prerelease branch -- e.g. `beta`, `alpha`. */
export interface ResolvedPrereleaseBranch extends ResolvedBranchBase {
  readonly type: 'prerelease';
  readonly channel: string | false;
  readonly prerelease: string;
}

/**
 * The real, resolved branch shape `semantic-release/lib/branches/index.js` produces at runtime -- NOT the same type as the public `BranchObject` exported from `semantic-release`'s own `index.d.ts`, despite the similar name. That public type only describes the branch CONFIG a user writes in `options.branches` (`name`/`channel`/`range`/`prerelease`, all before resolution); this one is what `run()` actually threads through every later step, computed by `semantic-release/lib/branches/normalize.js` per branch kind (`type`, `range`/`accept`/`mergeRange`/`main` all vary by kind, hence the discriminated union) and carries no public type of its own at all.
 */
export type ResolvedBranch = ResolvedReleaseBranch | ResolvedMaintenanceBranch | ResolvedPrereleaseBranch;
