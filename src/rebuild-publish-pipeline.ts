import buildPluginPipeline from 'semantic-release/lib/plugins/index.js';
import type { GateLogger, PluginPipeline, ResolvedOptions } from './semantic-release-shapes.js';

/**
 * Rebuilds the same `publish`/`addChannel`/`success`/`fail` plugin pipeline semantic-release's own `getConfig` builds internally, without going through `getConfig` itself -- there is no stored config file to re-discover at resume time, only the resolved `options` and `pluginsPath` a prior `detachRelease` call already persisted.
 *
 * Calling `buildPluginPipeline` (the real `semantic-release/lib/plugins/index.js` default export) directly, rather than hand-loading and calling each plugin module's exports, is a deliberate choice: `buildPluginPipeline` applies the same per-step `pipelineConfig.transform` semantic-release's own `run()` relies on (defined in `semantic-release/lib/definitions/plugins.js`) -- notably, merging `nextRelease` fields into whatever a `publish`/`addChannel` plugin returns. A hand-rolled direct call to each plugin's exports would skip that merge and silently diverge from real semantic-release publish behaviour, which defeats the point of this package existing as a faithful reference implementation.
 */
export async function rebuildPublishPipeline(params: {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly options: ResolvedOptions;
  readonly logger: GateLogger;
  readonly pluginsPath: Readonly<Record<string, string>>;
}): Promise<PluginPipeline> {
  return buildPluginPipeline(
    { cwd: params.cwd, env: params.env, options: params.options, logger: params.logger },
    params.pluginsPath,
  );
}
