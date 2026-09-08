import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // detach-release.test.ts/resume-release.test.ts/rebuild-publish-pipeline.test.ts spawn real git subprocesses against a disposable fixture repo (init, commit, tag, push) rather than mocking git -- matching @exadev/semantic-release-workspace's own vitest.config.ts, whose git-workspace-fixture tests need the identical headroom over the 5s default.
    testTimeout: 10_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-repo-fixture.ts'],
    },
  },
});
