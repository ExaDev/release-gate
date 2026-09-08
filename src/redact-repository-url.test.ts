import { describe, expect, it } from 'vitest';
import { redactRepositoryUrl } from './redact-repository-url.js';
import type { ResolvedOptions } from './semantic-release-shapes.js';

function baseOptions(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    repositoryUrl: 'https://x-access-token:ghs_secrettoken@github.com/exadev/release-gate.git',
    tagFormat: 'v${version}',
    branches: ['main'],
    plugins: [],
    originalRepositoryURL: 'https://github.com/exadev/release-gate.git',
    ...overrides,
  };
}

describe('redactRepositoryUrl', () => {
  it('replaces the credential-bearing repositoryUrl with the original', () => {
    const result = redactRepositoryUrl(baseOptions() as ResolvedOptions & { originalRepositoryURL: string });

    expect(result.repositoryUrl).toBe('https://github.com/exadev/release-gate.git');
  });

  it('never leaves a token substring anywhere in the returned repositoryUrl', () => {
    const result = redactRepositoryUrl(
      baseOptions({
        repositoryUrl: 'https://x-access-token:ghs_verysecrettoken1234@github.com/exadev/release-gate.git',
        originalRepositoryURL: 'https://github.com/exadev/release-gate.git',
      }) as ResolvedOptions & { originalRepositoryURL: string },
    );

    expect(result.repositoryUrl).not.toContain('ghs_verysecrettoken1234');
  });

  it('drops the originalRepositoryURL field from the result rather than duplicating it', () => {
    const result = redactRepositoryUrl(baseOptions() as ResolvedOptions & { originalRepositoryURL: string });

    expect(result.originalRepositoryURL).toBeUndefined();
  });

  it('leaves every other option field untouched', () => {
    const result = redactRepositoryUrl(baseOptions() as ResolvedOptions & { originalRepositoryURL: string });

    expect(result.tagFormat).toBe('v${version}');
    expect(result.branches).toEqual(['main']);
    expect(result.plugins).toEqual([]);
  });
});
