# @exadev/release-gate

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/release-gate) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@exadev/release-gate) [![Release](https://img.shields.io/github/v/release/ExaDev/release-gate)](https://github.com/ExaDev/release-gate/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/release-gate/ci.yml?branch=main)](https://github.com/ExaDev/release-gate/actions)

> Tag and push a semantic-release release, then finish publishing it later -- from a separate process, after an external gate -- without semantic-release core supporting this natively.

## Why

semantic-release's own `run()` tags and pushes a release, then immediately calls every configured `publish` plugin (npm, GitHub Releases, and so on) in the same process, in the same CI job. There is no supported way to stop after the tag exists and resume publishing later, once something outside semantic-release itself -- a staging deploy, a smoke test, a manual sign-off -- has confirmed the release should actually go out. [semantic-release/semantic-release#2411](https://github.com/semantic-release/semantic-release/issues/2411) asks for exactly this, and has been raised (and declined as out of scope for core) more than once. This package is the standalone reference implementation promised in the design comment on that issue: a small, additive pair of functions -- `detachRelease` and `resumeRelease` -- built entirely on semantic-release's own internals, demonstrating the split as a real, usable thing rather than an abstract proposal.

It works by reimplementing the body of semantic-release's internal `run()` function up to (and including) the tag-and-push step, then stopping -- there is no exported seam inside semantic-release to hook into this halfway, since its only public export is the single function that runs a release start to finish. The state needed to finish the release later (which branch, which commits, which version, which notes) is captured into a plain, JSON-serializable `ReleaseGateState`, which `resumeRelease` picks up -- in the same process or a completely different one -- to rebuild and run the real `publish`/`success` plugin pipeline.

## Getting started

```sh
pnpm add @exadev/release-gate
```

```ts
// Job 1: tag and push, but stop short of publishing.
import { detachRelease } from '@exadev/release-gate';
import { writeFile } from 'node:fs/promises';

const state = await detachRelease();
if (state) {
  await writeFile('release-gate-state.json', JSON.stringify(state));
}
```

```ts
// Job 2, later -- once whatever external gate needs to pass has passed.
import { resumeRelease } from '@exadev/release-gate';
import { readFile } from 'node:fs/promises';

const state: unknown = JSON.parse(await readFile('release-gate-state.json', 'utf8'));
const releases = await resumeRelease(state);
```

## `detachRelease(cliOptions?, execEnv?)`

```ts
function detachRelease(cliOptions?: Options, execEnv?: DetachReleaseEnv): Promise<ReleaseGateState | null>;

interface DetachReleaseEnv {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}
```

The signature deliberately mirrors semantic-release's own default export -- `cliOptions` is the real semantic-release `Options` type, and a caller can swap `semanticRelease(cliOptions, execEnv)` for `detachRelease(cliOptions, execEnv)` with no other change. Runs verify config, branch resolution, push-auth verification, `verifyConditions`, commit analysis, `verifyRelease`, `generateNotes`, and `prepare`, then creates and pushes the release tag -- exactly what semantic-release itself does at this point in a real run.

Returns `null` in every case semantic-release's own `run()` would have stopped before publishing anyway: no CI environment detected, a pull-request-triggered run, a branch semantic-release isn't configured to release from, a local branch that's behind its remote, no releasable commits since the last release, or dry-run mode (a dry run never creates a tag, so there is nothing to resume). Otherwise returns the `ReleaseGateState` a later `resumeRelease` call needs.

## `resumeRelease(state, execEnv?)`

```ts
function resumeRelease(state: unknown, execEnv?: ResumeReleaseEnv): Promise<readonly Release[]>;

interface ResumeReleaseEnv {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}
```

`state` is accepted as `unknown` and validated at runtime (via `isReleaseGateState`), not typed as `ReleaseGateState` directly -- it typically arrives from outside the current process (a file, a CI artifact), so it carries no compile-time guarantee by the time it reaches this function. A state this package didn't produce, or one from an incompatible `schemaVersion`, throws `ReleaseGateStateError`.

`cwd`/`env`/`stdout`/`stderr` are always built fresh for this call, never read out of `state`: a resume can run in an entirely different process, checkout, or CI job than the one that ran `detachRelease`, with different credentials and a different logger destination. In particular, the authenticated push URL is re-derived from this call's own `env`, not persisted -- see `ReleaseGateState` below.

Rebuilds the real `publish`/`success` plugin pipeline from `state.options`/`state.pluginsPath` and runs it against the persisted `branch`/`lastRelease`/`commits`/`nextRelease`, mirroring semantic-release's own real call sites exactly (`publish` then `success`, with `fail` invoked and the error rethrown if `publish` or `success` throws). Returns whatever the configured publish plugins returned.

## ReleaseGateState

| Field | What it is |
| --- | --- |
| `schemaVersion` | Always `1` in this version. `resumeRelease` rejects a state with a different value rather than misinterpreting it. |
| `options` | The resolved semantic-release options `detachRelease` ran with. |
| `pluginsPath` | The shareable-config plugin-resolution map. Always `{}` -- see "What this package does not do" below. |
| `branches` | Every branch semantic-release resolved for the repository. |
| `branch` | The one branch this release ran on. |
| `lastRelease` | The release found on the branch before this one, or `{}` for a first release. |
| `commits` | Every commit since `lastRelease` that was analysed. |
| `nextRelease` | The release that was tagged and pushed -- `resumeRelease` publishes exactly this. |

**Deliberately not persisted:** `cwd`, `env`, `stdout`, `stderr`, and the logger are all process-bound and rebuilt fresh by `resumeRelease` (see above); `releases` is always empty at the point `detachRelease` returns, since the only thing that could have populated it -- the maintenance-branch backport path -- is rejected outright, not silently handled.

**`options.repositoryUrl` is always the credential-free original URL, never the credential-embedded one semantic-release builds for pushing.** semantic-release's own `run()` overwrites `options.repositoryUrl` with a URL carrying an embedded CI token (e.g. `https://x-access-token:$GITHUB_TOKEN@github.com/...`) so `git push` can authenticate non-interactively. `ReleaseGateState` is designed to be written to a file or CI artifact and read back somewhere else, so it must never carry that credential -- `detachRelease` swaps it back to the original before returning. `resumeRelease` re-derives its own authenticated push URL from whatever `env` it's given.

## What this package does not do

- **No support for the maintenance-branch backport/`addChannel` path.** semantic-release can add an already-published release to an additional distribution channel when a maintenance branch merges up from a lower one -- a structurally distinct flow from tagging a new release, with its own tag-and-push step that happens *before* `publish` even runs, not after it. `detachRelease` throws `ReleaseGateConfigurationError` if this path would apply, rather than silently mishandling it.
- **No support for `extends` (shareable configuration).** semantic-release's own `getConfig` resolves `extends` into a `pluginsPath` map used to load plugins relative to the shareable config's own location, but never exposes that map in its return value -- there is no way to reconstruct it later without re-running `extends` resolution from scratch, which `resumeRelease` has no config file to do. `detachRelease` throws `ReleaseGateConfigurationError` if `cliOptions.extends` is set.
- **No stdout/stderr secret redaction.** semantic-release's own default export wraps process stdout/stderr to scrub sensitive values (tokens, credentials) out of anything a plugin logs, via `hook-std`. `detachRelease`/`resumeRelease` don't do this -- it's a secondary console-logging safety net, not part of the tag-before-publish mechanic this package exists to demonstrate, and adding a real dependency to reproduce it wasn't judged worth it for a reference implementation. A caller with plugins that might log secrets should scrub CI logs through whatever mechanism their CI provider already offers for that.

## Pairing with @exadev/build-identity

[`@exadev/build-identity`](https://www.npmjs.com/package/@exadev/build-identity) answers "is this commit a real, tagged release" from live git state. Combined with this package, a build can report a genuine three-state identity instead of just two:

```ts
import { resolveBuildIdentity } from '@exadev/build-identity';
import { readFile } from 'node:fs/promises';

const identity = resolveBuildIdentity(process.cwd(), 'exadev/example');

if (identity.kind === 'commit') {
  // Not yet a release at all.
} else {
  // A tag exists -- but was it actually published, or is it still sitting behind the gate?
  const gateState: unknown = await readFile('release-gate-state.json', 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  const stillGated = gateState !== null;
}
```

There's no code dependency between the two packages -- this is a documentation-only pairing, since `build-identity`'s tag-confirmed fact and `release-gate`'s publish-confirmed fact are two independently useful, independently checkable things.

## Why an exact semantic-release version pin

This package deep-imports semantic-release's own internal `lib/*.js` modules (`getConfig`, `verify`, `getBranches`, `getCommits`, the plugin pipeline builder, and more) to reimplement `run()`'s body. `semantic-release`'s own `package.json` has no `exports` field, so nothing blocks these deep imports from resolving -- but only its single default export carries a semver guarantee. A minor or patch bump could change any of these internals' signatures or behaviour with no warning. `package.json` pins `semantic-release` to an exact version, not a caret range, and a real end-to-end integration test (a disposable git repository, a real tag, a real push) exists specifically to catch a future version silently breaking one of these deep imports. Upgrading is a deliberate, manually-reviewed step, not an automatic dependency bump.

## Conventions

British English throughout. Conventional commits, enforced by commitlint (`commitlint.config.ts`) and released automatically by `semantic-release` (`release.config.ts`) on every push to `main`. Strict TypeScript, no `any`, no unjustified type assertions -- see `eslint.config.ts`, which lints this package with `@exadev/eslint-config`.

## Publishing

Releases are handled entirely by `.github/workflows/ci.yml`'s `release` job: `semantic-release` analyses commits since the last tag, bumps the version, publishes to npmjs.org over OIDC trusted publishing (no stored `NPM_TOKEN`), and creates the tag and GitHub Release. See that workflow for the exact steps, and `CONTRIBUTING.md` for what a brand-new trusted-publish package needed once, by hand, before that automation could run unattended.
