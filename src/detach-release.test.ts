import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detachRelease } from './detach-release.js';
import { ReleaseGateConfigurationError } from './errors.js';
import { asPluginSpec, commitFile, createGitFixtureRepo, createRecordingPlugin, listRemoteTags } from './test-repo-fixture.js';
import type { GitFixtureRepo } from './test-repo-fixture.js';

/**
 * `noCi: true` deterministically takes the real (non-dry-run) path regardless of whatever CI environment this test itself happens to run under, matching semantic-release's own documented escape hatch for exactly this case (`run()`'s own `!isCi && !options.dryRun && !options.noCi` dry-run fallback). `env` is a minimal object (just `PATH`, so `execa`/`execFileSync` can find the real `git` binary) rather than the inherited `process.env`, so `env-ci`'s own service-detection loop never accidentally matches this session's real CI environment and drags in an unrelated `isPr`/`prBranch`.
 */
const CLEAN_ENV: NodeJS.ProcessEnv = { PATH: process.env['PATH'] };

/** `redact-repository-url.test.ts` covers the actual credential-substitution logic directly against a synthetic credentialed URL -- the real regression case (a `GITHUB_TOKEN`-forced HTTPS auth fallback) can't be reproduced end to end here, since a `file://` push to a local bare remote never exercises credential auth at all. This suite's "persists the credential-free original" test below is the closest honest integration-level equivalent: it confirms the persisted state's `repositoryUrl` is the pre-`getGitAuthUrl` value, not whatever the push URL happened to resolve to. */

describe('detachRelease', () => {
  let repo: GitFixtureRepo;

  beforeEach(async () => {
    repo = await createGitFixtureRepo();
  });

  afterEach(async () => {
    await repo.remove();
  });

  it('returns null when there are no releasable commits', async () => {
    const { plugin } = createRecordingPlugin();

    const state = await detachRelease({ plugins: [asPluginSpec(plugin)], noCi: true }, { cwd: repo.root, env: CLEAN_ENV });

    expect(state).toBeNull();
  });

  it('returns null and creates no tag in dry-run mode, even with a releasable commit', async () => {
    await commitFile(repo.root, 'feature.txt', 'content', 'feat: add a feature');
    const { plugin } = createRecordingPlugin();

    const state = await detachRelease({ plugins: [asPluginSpec(plugin)], noCi: true, dryRun: true }, { cwd: repo.root, env: CLEAN_ENV });

    expect(state).toBeNull();
    expect(listRemoteTags(repo.remote)).toEqual([]);
  });

  it('rejects extends outright', async () => {
    await expect(detachRelease({ extends: './shared-config.js' }, { cwd: repo.root, env: CLEAN_ENV })).rejects.toBeInstanceOf(
      ReleaseGateConfigurationError,
    );
  });

  it('tags and pushes the release, but never calls publish or success', async () => {
    await commitFile(repo.root, 'feature.txt', 'content', 'feat: add a feature');
    const { plugin, calls } = createRecordingPlugin();

    const state = await detachRelease({ plugins: [asPluginSpec(plugin)], noCi: true }, { cwd: repo.root, env: CLEAN_ENV });

    expect(state).not.toBeNull();
    expect(state?.nextRelease.type).toBe('minor');
    expect(state?.nextRelease.version).toBe('1.0.0');
    expect(state?.nextRelease.gitTag).toBe('v1.0.0');

    expect(listRemoteTags(repo.remote)).toContain('v1.0.0');
    expect(calls.publish).toEqual([]);
    expect(calls.success).toEqual([]);
  });

  it('persists the credential-free original repositoryUrl, not whatever getGitAuthUrl resolved for the push', async () => {
    await commitFile(repo.root, 'feature.txt', 'content', 'feat: add a feature');
    const { plugin } = createRecordingPlugin();

    const state = await detachRelease({ plugins: [asPluginSpec(plugin)], noCi: true }, { cwd: repo.root, env: CLEAN_ENV });

    expect(state?.options.repositoryUrl).toBe(new URL(`file://${repo.remote}`).href);
  });
});
