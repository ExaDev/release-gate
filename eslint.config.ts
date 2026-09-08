import { defineConfig } from 'eslint/config';
import exadev from '@exadev/eslint-config';

export default defineConfig(
  {
    ignores: ['dist', 'coverage', 'node_modules', '.turbo'],
  },
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
  },
  ...exadev,
  // src/index.ts is this package's own entry-point barrel -- keep it, don't ban it.
  { files: ['src/index.ts'], rules: { 'exadev/barrel-policy': ['error', { mode: 'single' }] } },
  // semantic-release-lib.d.ts deliberately uses inline `import('semantic-release').Foo` type queries instead of a top-level `import type` statement -- a top-level import/export would turn the file into a module, which silently breaks its `declare module 'semantic-release/lib/*.js'` ambient augmentations (confirmed directly: TypeScript stops consulting a module file's own `declare module` blocks once a real, resolvable file exists on disk for that specifier). See that file's own doc comment.
  { files: ['src/semantic-release-lib.d.ts'], rules: { '@typescript-eslint/consistent-type-imports': 'off' } },
  // test-repo-fixture.ts's asPluginSpec bridges a confirmed gap in semantic-release's own published types: its public PluginSpec type (`string | [string, T]`) doesn't capture the inline-plugin-object form the runtime genuinely supports (see that function's own doc comment). No structural narrowing path exists for this cast.
  { files: ['src/test-repo-fixture.ts'], rules: { '@typescript-eslint/consistent-type-assertions': 'off' } },
);
