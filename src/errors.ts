export class ReleaseGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** `cliOptions` passed to `detachRelease` uses a feature this package deliberately does not support: `extends` (shareable config -- see `ReleaseGateState.pluginsPath`'s doc comment), or the run would have exercised semantic-release's own maintenance-branch backport/`addChannel` path (see `lib/get-release-to-add.js`) -- explicitly out of scope, see this package's README's "What this package does not do" section. */
export class ReleaseGateConfigurationError extends ReleaseGateError {}

/** A `ReleaseGateState` handed to `resumeRelease` is malformed or from an incompatible `schemaVersion`. */
export class ReleaseGateStateError extends ReleaseGateError {}
