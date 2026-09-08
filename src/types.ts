import type { Commit, LastRelease, NextRelease } from 'semantic-release';
import type { ResolvedBranch, ResolvedOptions } from './semantic-release-shapes.js';

/**
 * `NextRelease`, corrected for one field where semantic-release's own public type is inaccurate: `run()`'s real assignment is `nextRelease.channel = context.branch.channel || null`, so `channel` is genuinely `string | null` at runtime -- `null` for the default channel -- never the bare `string` the public type declares. Every other field matches the public `NextRelease` shape exactly.
 */
export type GateNextRelease = Omit<NextRelease, 'channel'> & { readonly channel: string | null };

/**
 * Everything `resumeRelease` needs to finish a release that `detachRelease` has already tagged and pushed, serialized to plain, JSON-safe data so it can cross a process or CI-job boundary (a file, a CI artifact, a database row).
 *
 * Deliberately excludes `cwd`/`env`/`stdout`/`stderr`/`logger`: these are process-bound, and a resume may run in an entirely different process, checkout, or CI job -- `resumeRelease` always builds fresh ones rather than trusting stale, potentially-stale-secret-bearing values out of storage. Also excludes `releases`: at the point `detachRelease` returns, semantic-release's own `context.releases` is always still empty (the only thing that could have populated it, the maintenance-branch backport/`addChannel` path, is explicitly rejected -- see `ReleaseGateConfigurationError`).
 */
export interface ReleaseGateState {
  /** Bumped on any future breaking change to this shape, so `resumeRelease` can reject a state it doesn't understand rather than silently misinterpret it. */
  readonly schemaVersion: 1;

  /**
   * The resolved semantic-release options `detachRelease` ran with, as they existed after `getConfig` but before the tag+push block -- with one deliberate difference from what a live `context.options` holds at that point: `repositoryUrl` here is always the credential-free original URL (`options.originalRepositoryURL` in semantic-release's own outer function), never the credential-embedded push URL `getGitAuthUrl` produces. `resumeRelease` re-derives its own credentialed push URL from the fresh `env` it's given, since a resume may run in a CI job whose credentials differ from the one that ran `detachRelease`. See `redact-repository-url.ts`.
   */
  readonly options: ResolvedOptions;

  /**
   * The shareable-config plugin-resolution map `semantic-release/lib/get-config.js` builds from `options.extends`. Always an empty object in this package's current version: `detachRelease` rejects `extends` outright (`ReleaseGateConfigurationError`), because `getConfig`'s own return value never exposes the `pluginsPath` map it builds internally, so reconstructing it without re-running `extends` resolution from scratch isn't possible. Kept as an explicit field, not hardcoded past this point, so a future version that does support `extends` can start persisting it without a schema-version bump.
   */
  readonly pluginsPath: Readonly<Record<string, string>>;

  /** Every branch semantic-release resolved for this repository, exactly as `getBranches` returned it. */
  readonly branches: readonly ResolvedBranch[];

  /** The one branch this release ran on -- `branches.find(({name}) => name === ciBranch)`. */
  readonly branch: ResolvedBranch;

  /** The release found on the branch before this one, or `{}` if this is the first release. */
  readonly lastRelease: Partial<LastRelease>;

  /** Every commit since `lastRelease` that `analyzeCommits` and `generateNotes` ran against. */
  readonly commits: readonly Commit[];

  /** The release `detachRelease` tagged and pushed -- `resumeRelease` publishes exactly this. */
  readonly nextRelease: GateNextRelease;
}
