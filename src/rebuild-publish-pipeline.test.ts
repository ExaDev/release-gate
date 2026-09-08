import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import getLogger from 'semantic-release/lib/get-logger.js';
import { rebuildPublishPipeline } from './rebuild-publish-pipeline.js';
import { asPluginSpec, createRecordingPlugin } from './test-repo-fixture.js';
import type { ResolvedOptions } from './semantic-release-shapes.js';

function baseOptions(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    repositoryUrl: 'https://github.com/exadev/release-gate.git',
    tagFormat: 'v${version}',
    branches: ['main'],
    plugins: [],
    ...overrides,
  };
}

describe('rebuildPublishPipeline', () => {
  it('rebuilds a real, callable publish/success pipeline from an inline plugin spec, with no config file discovery', async () => {
    const { plugin, calls } = createRecordingPlugin();
    const logger = getLogger({ stdout: new PassThrough(), stderr: new PassThrough() });

    const pipeline = await rebuildPublishPipeline({
      cwd: process.cwd(),
      env: process.env,
      options: baseOptions({ plugins: [asPluginSpec(plugin)] }),
      logger,
      pluginsPath: {},
    });

    const releases = await pipeline.publish({ env: process.env, options: baseOptions(), nextRelease: { version: '1.2.3', gitTag: 'v1.2.3' } });
    await pipeline.success({ env: process.env, options: baseOptions(), nextRelease: { version: '1.2.3', gitTag: 'v1.2.3' }, releases });

    expect(calls.publish).toHaveLength(1);
    expect(calls.success).toHaveLength(1);
    expect(releases).toHaveLength(1);
  });

  it('never resolves a plugin against a shareable config path when pluginsPath is empty', async () => {
    const { plugin } = createRecordingPlugin();
    const logger = getLogger({ stdout: new PassThrough(), stderr: new PassThrough() });

    // An empty pluginsPath (this package's own permanent v1 value, since it never supports `extends`) must still resolve a plain inline plugin object correctly -- this is the same shape detachRelease always persists into ReleaseGateState.pluginsPath.
    await expect(
      rebuildPublishPipeline({
        cwd: process.cwd(),
        env: process.env,
        options: baseOptions({ plugins: [asPluginSpec(plugin)] }),
        logger,
        pluginsPath: {},
      }),
    ).resolves.toBeDefined();
  });
});
