# Contributing

## Local development

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Commits are conventional (`feat:`, `fix:`, `chore:`, ...), enforced by commitlint via a `commit-msg` hook. `pre-commit` runs `lint-staged`; `pre-push` runs typecheck, test, and build.

`pnpm test` spawns real, disposable git repositories to exercise `detachRelease`/`resumeRelease` against actual git state -- no mocked git. This is deliberate: the whole point of this package is faithfully reproducing semantic-release's own tag-and-push behaviour, which a mock can't credibly stand in for.

## Releasing

Every push to `main` runs `.github/workflows/ci.yml`'s `release` job: `semantic-release` analyses commits since the last tag, decides the next version, publishes to npmjs.org, and creates the git tag and GitHub Release. Nothing about the release commands themselves is manual.

**npm trusted publishing (OIDC) cannot bootstrap a package that has never been published before.** npm's own CLI (`npm trust --help`) states this as a hard prerequisite: "Package must exist: The package you're configuring must already exist on the npm registry." There is no way -- via the npmjs.com UI or the `npm trust` CLI -- to configure the trust relationship between this repository's workflow and an npm package name before that name has at least one published version. This is a platform limitation, not something this repository's own CI configuration can work around.

Concretely, that meant the very first version of this package needed one manual, one-time step before `semantic-release`'s own OIDC-based publish could work unattended for every version after it:

1. A maintainer with npm publish rights ran a single `npm publish` from an authenticated local session (2FA-backed), creating `@exadev/release-gate` on the registry at a low placeholder version.
2. Once the package existed, `npm trust github @exadev/release-gate --repo ExaDev/release-gate --file .github/workflows/ci.yml --allow-publish` registered the trust relationship between this repository's `release` job and the package -- the CLI equivalent of the "Trusted Publisher" section under the package's settings on npmjs.com.
3. From that point on, `.github/workflows/ci.yml`'s `release` job publishes every subsequent version over OIDC with no stored token at all (see the workflow's own comments on why `registry-url` is omitted from `setup-node` and why `NPM_TOKEN`/`NODE_AUTH_TOKEN` are explicitly blanked in the release step's environment).

If this package's npm name is ever unpublished, transferred, or otherwise needs its trusted-publisher configuration recreated from scratch, repeat steps 1-2 above -- there is no fully-automated path around npm's own package-must-exist requirement.
