import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  root: 'src',
  format: ['esm', 'cjs'],
  dts: true,
  // 'node', not @exadev/build-identity's 'neutral' -- this package shells out to git and the filesystem, unlike build-identity's pure computation. Consequence confirmed directly: under 'node', tsdown emits unambiguous `.mjs`/`.d.mts` (ESM) and `.cjs`/`.d.cts` (CJS) filenames, rather than 'neutral's plain `.js`/`.d.ts` (ESM, relying on this package.json's own "type": "module") plus `.cjs`/`.d.cts` (CJS) -- package.json's `main`/`module`/`types`/`exports` fields are written to match the `.mjs`/`.cjs` names this platform setting actually produces.
  platform: 'node',
  clean: true,
});
