import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detachRelease } from './detach-release.js';
import { ReleaseGateStateError } from './errors.js';
import { resumeRelease } from './resume-release.js';
import { asPluginSpec, commitFile, createGitFixtureRepo, createRecordingPlugin } from './test-repo-fixture.js';
import type { GitFixtureRepo } from './test-repo-fixture.js';

const CLEAN_ENV: NodeJS.ProcessEnv = { PATH: process.env['PATH'] };

class FakeSemanticReleaseError extends Error {
  readonly semanticRelease = true;
}

describe('resumeRelease', () => {
  let repo: GitFixtureRepo;

  beforeEach(async () => {
    repo = await createGitFixtureRepo();
  });

  afterEach(async () => {
    await repo.remove();
  });

  it('finishes a release detachRelease has already tagged and pushed', async () => {
    await commitFile(repo.root, 'feature.txt', 'content', 'feat: add a feature');
    const { plugin, calls } = createRecordingPlugin();

    const state = await detachRelease({ plugins: [asPluginSpec(plugin)], noCi: true }, { cwd: repo.root, env: CLEAN_ENV });
    expect(state).not.toBeNull();
    expect(calls.publish).toEqual([]);
    expect(calls.success).toEqual([]);

    const releases = await resumeRelease(state, { cwd: repo.root, env: CLEAN_ENV });

    expect(releases).toHaveLength(1);
    expect(calls.publish).toHaveLength(1);
    expect(calls.success).toHaveLength(1);
    expect(calls.publish[0]?.nextRelease.version).toBe('1.0.0');
  });

  it('rejects a state with no schemaVersion', async () => {
    await expect(resumeRelease({})).rejects.toBeInstanceOf(ReleaseGateStateError);
  });

  it('rejects a state from an incompatible schemaVersion', async () => {
    await expect(resumeRelease({ schemaVersion: 2 })).rejects.toBeInstanceOf(ReleaseGateStateError);
  });

  it('rejects a state missing required fields', async () => {
    await expect(resumeRelease({ schemaVersion: 1, options: { repositoryUrl: 'https://example.invalid/x.git' } })).rejects.toBeInstanceOf(
      ReleaseGateStateError,
    );
  });

  it('invokes fail and rethrows when a publish plugin throws', async () => {
    await commitFile(repo.root, 'feature.txt', 'content', 'feat: add a feature');
    const { plugin, calls } = createRecordingPlugin();
    const publishError = new FakeSemanticReleaseError('publish plugin exploded');
    plugin['publish'] = () => {
      throw publishError;
    };

    const state = await detachRelease({ plugins: [asPluginSpec(plugin)], noCi: true }, { cwd: repo.root, env: CLEAN_ENV });
    expect(state).not.toBeNull();

    await expect(resumeRelease(state, { cwd: repo.root, env: CLEAN_ENV })).rejects.toThrow('publish plugin exploded');
    expect(calls.fail).toHaveLength(1);
  });
});
