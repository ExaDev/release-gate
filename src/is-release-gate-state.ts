import type { ReleaseGateState } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runtime guard for `ReleaseGateState`, for the same reason any `JSON.parse` boundary needs one: a state handed to `resumeRelease` typically arrives from a file or CI artifact `resumeRelease` never wrote itself, so its real shape carries no compile-time guarantee. Checks structural presence and each field's coarse shape, not every nested value -- `resumeRelease`'s own deep-imported semantic-release calls fail loudly on a field that's present but malformed in a way this guard doesn't catch, which is an acceptable division of labour for a state that only this package produces in the first place.
 */
export function isReleaseGateState(value: unknown): value is ReleaseGateState {
  if (!isRecord(value)) {
    return false;
  }
  if (value['schemaVersion'] !== 1) {
    return false;
  }
  const options = value['options'];
  if (!isRecord(options) || typeof options['repositoryUrl'] !== 'string') {
    return false;
  }
  if (!isRecord(value['pluginsPath'])) {
    return false;
  }
  if (!Array.isArray(value['branches'])) {
    return false;
  }
  const branch = value['branch'];
  if (!isRecord(branch) || typeof branch['name'] !== 'string') {
    return false;
  }
  if (!isRecord(value['lastRelease'])) {
    return false;
  }
  if (!Array.isArray(value['commits'])) {
    return false;
  }
  const nextRelease = value['nextRelease'];
  if (!isRecord(nextRelease) || typeof nextRelease['version'] !== 'string' || typeof nextRelease['gitTag'] !== 'string') {
    return false;
  }
  return true;
}
