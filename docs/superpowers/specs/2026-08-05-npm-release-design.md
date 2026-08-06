# npm release design

## Goal

Publish `@freelensapp/opencode-extension` to npm and create matching GitHub
releases through the same release chain used by
`@freelensapp/karpenter-extension`.

## Workflow chain

```text
[Maintainer] workflow_dispatch -> Automated npm version
                                      |
                           version-bump PR merged to main
                                      v
                                Automated tag
                                      |
                              stable vX.Y.Z tag pushed
                                      v
                                   Release
                                      |
                       npm publication + GitHub Release
```

## Workflows

### Automated npm version

`npm-version.yaml` accepts a semver version or bump type. It runs
`pnpm bump-version`, refreshes the lockfile, and creates or updates the
`automated/npm-version` PR. Merging that PR updates `main`.

### Automated tag

`tag.yaml` watches closed pull requests targeting `main`. When a merged
`Automated npm version` PR leaves a stable `X.Y.Z` version in `package.json`,
maintainer can alternatively add `/tag` to closed automated version PR issue.

### Release

`release.yaml` runs when a `v*` tag is pushed. It verifies tag version matches
`package.json`, installs dependencies, builds, packs, and publishes the npm
package. Stable versions use npm dist-tag `latest`; versions containing a
hyphen use `next`. It then creates a GitHub Release with generated `.tgz`
artifact.

## Required configuration

- GitHub environments: `automated` and `publishing`.
- Repository secret `GH_TOKEN` with permission to create/update branches, pull
  requests, and tags.
- npm trusted publisher for this repository's `Release` workflow. OIDC is used
  through `id-token: write`; no npm access token is stored in GitHub.

## Documentation

`RELEASE.md` explains release trigger, review, automatic publication,
post-release prerelease bump, prerequisites, and workflow graph.

## Validation

Validate copied YAML with Trunk. Build and pack extension after implementation
to confirm package artifact exists.
