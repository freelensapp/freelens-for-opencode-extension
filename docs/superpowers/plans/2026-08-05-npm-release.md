# npm Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@freelensapp/opencode-extension` to npm and GitHub Releases through automated versioning, tagging, and release workflows.

**Architecture:** Three GitHub workflows form release chain. Maintainer starts version-bump workflow, merged stable version PR creates `vX.Y.Z` tag, then tag-triggered workflow builds, packs, publishes via npm OIDC, and attaches archive to GitHub Release. `RELEASE.md` documents operator flow and required repository configuration.

**Tech Stack:** GitHub Actions, pnpm 10, Node.js 24.15.0, npm trusted publishing (OIDC), GitHub Environments.

---

## File Structure

- Create: `.nvmrc` - Node version used by automation.
- Create: `.github/workflows/npm-version.yaml` - dispatchable version-bump PR automation.
- Create: `.github/workflows/tag.yaml` - stable version tag automation.
- Create: `.github/workflows/release.yaml` - tag-triggered npm and GitHub Release publication.
- Create: `RELEASE.md` - maintainer runbook and required GitHub/npm setup.

### Task 1: Pin Automation Node Version

**Files:**
- Create: `.nvmrc`

- [ ] **Step 1: Add version file required by `actions/setup-node`**

```text
24.15.0
```

- [ ] **Step 2: Verify pinned version parses**

Run: `node --version`

Expected: local Node is `v24.15.0` or compatible after your version manager reads `.nvmrc`.

- [ ] **Step 3: Commit when requested**

```sh
git add .nvmrc
git commit -m "Pin release automation Node version"
```

### Task 2: Automate Version-Bump Pull Requests

**Files:**
- Create: `.github/workflows/npm-version.yaml`

- [ ] **Step 1: Create dispatchable version workflow**

```yaml
name: Automated npm version

on:
  workflow_dispatch:
    inputs:
      newversion:
        description: New version (X.Y.Z | major | minor | patch | premajor | preminor | prepatch | prerelease)
        required: true
        default: prerelease
  release:
    types:
      - released

permissions:
  contents: write
  pull-requests: write

jobs:
  npm-version:
    name: npm version
    runs-on: ubuntu-22.04
    environment: automated
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          token: ${{ secrets.GH_TOKEN }}
      - name: Setup node
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          package-manager-cache: false
      - name: Setup pnpm
        run: corepack enable
      - name: Get pnpm cache directory
        shell: bash
        run: echo "pnpm_cache_dir=$(pnpm store path)" >> ${GITHUB_ENV}
      - name: Use pnpm cache
        uses: actions/cache@v5
        with:
          path: ${{ env.pnpm_cache_dir }}
          key: ubuntu-22.04-x64-node-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ubuntu-22.04-x64-node-
      - name: Install pnpm dependencies
        id: install-pnpm
        run: timeout 300 pnpm install --color=always --prefer-offline --frozen-lockfile
        continue-on-error: true
      - name: Install pnpm dependencies (retry)
        if: steps.install-pnpm.outcome == 'failure'
        run: timeout 300 pnpm install --color=always --prefer-offline --frozen-lockfile
      - name: Set version
        run: |
          set -eo pipefail
          pnpm bump-version "$newversion" | tee .github/update.log
          jq -r .version package.json > .github/version.log
          sed -e 's/\x1b\[[0-9;]*m//g' .github/update.log > .github/pr_body.log
        env:
          newversion: ${{ github.event.inputs.newversion || 'prerelease' }}
      - name: Update pnpm dependencies
        id: update-pnpm
        run: timeout 300 pnpm install --color=always --prefer-offline
        continue-on-error: true
      - name: Update pnpm dependencies (retry)
        if: steps.update-pnpm.outcome == 'failure'
        run: timeout 300 pnpm install --color=always --prefer-offline
      - name: Check for changes
        run: |
          if git diff --exit-code; then
            echo "changes=false" >> $GITHUB_ENV
          else
            echo "changes=true" >> $GITHUB_ENV
          fi
      - name: Commit and push to branch
        if: env.changes == 'true'
        uses: EndBug/add-and-commit@v9
        with:
          github_token: ${{ secrets.GH_TOKEN }}
          default_author: github_actions
          message: Automated npm version ${{ github.event.inputs.newversion || 'prerelease' }}
          new_branch: automated/npm-version
          fetch: false
          push: origin automated/npm-version --set-upstream --force
      - name: Create pull request
        if: env.changes == 'true'
        run: |-
          version=$(cat .github/version.log)
          if [[ $(gh pr view automated/npm-version --json state --jq .state || true) != "OPEN" ]]; then
            gh pr create \
              --head automated/npm-version \
              --title "Automated npm version v${version}" \
              --body-file .github/pr_body.log \
              --label automated
          else
            gh pr edit automated/npm-version \
              --title "Automated npm version v${version}" \
              --body-file .github/pr_body.log
          fi
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
      - name: Close pull request
        if: env.changes == 'false'
        run: gh pr list --head automated/npm-version --json number --jq '.[].number' | xargs -rn1 gh pr close --delete-branch
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

- [ ] **Step 2: Validate workflow YAML**

Run: `pnpm trunk:check`

Expected: no errors for `.github/workflows/npm-version.yaml`.

- [ ] **Step 3: Commit when requested**

```sh
git add .github/workflows/npm-version.yaml
git commit -m "Add automated npm version workflow"
```

### Task 3: Create Stable Version Tags

**Files:**
- Create: `.github/workflows/tag.yaml`

- [ ] **Step 1: Create tag workflow**

```yaml
name: Automated tag

on:
  issue_comment:
    types:
      - created
  pull_request:
    branches:
      - main
    types:
      - closed

permissions:
  contents: write
  id-token: write
  pull-requests: read

jobs:
  create-tag:
    name: tag
    runs-on: ubuntu-24.04
    environment: automated
    timeout-minutes: 10
    if: (startsWith(github.event.issue.title, 'Automated npm version') && github.event.issue.state == 'closed' && github.event.comment.body == '/tag') || (startsWith(github.event.pull_request.title, 'Automated npm version') && github.event.pull_request.merged)
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 0
          ref: main
      - name: Get version from package.json
        id: package-json
        run: |
          echo "version=$(jq -r .version package.json)" >> $GITHUB_OUTPUT
      - name: Check if version is release
        id: check-version
        run: |
          if [[ "${{ steps.package-json.outputs.version }}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "is_release=true" >> $GITHUB_OUTPUT
          else
            echo "is_release=false" >> $GITHUB_OUTPUT
          fi
      - name: Create tag from the main branch
        if: steps.check-version.outputs.is_release == 'true'
        uses: actions/github-script@v8
        with:
          script: |
            const mainRef = await github.rest.git.getRef({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: 'heads/main',
            });
            const result = await github.rest.git.createRef({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: 'refs/tags/v${{ steps.package-json.outputs.version }}',
              sha: mainRef.data.object.sha,
            });
            console.log(result);
          github-token: ${{ secrets.GH_TOKEN }}
```

- [ ] **Step 2: Validate workflow YAML**

Run: `pnpm trunk:check`

Expected: no errors for `.github/workflows/tag.yaml`.

- [ ] **Step 3: Commit when requested**

```sh
git add .github/workflows/tag.yaml
git commit -m "Add automated release tagging workflow"
```

### Task 4: Publish Tagged Releases

**Files:**
- Create: `.github/workflows/release.yaml`

- [ ] **Step 1: Create tag-triggered publish workflow**

```yaml
name: Release

on:
  push:
    tags:
      - v*

permissions:
  contents: write
  id-token: write

jobs:
  release:
    name: release
    runs-on: ubuntu-22.04
    environment: publishing
    env:
      VITE_PRESERVE_MODULES: "false"
    steps:
      - name: Checkout plugin
        uses: actions/checkout@v6
      - name: Check if package version matches
        run: test "${GITHUB_REF_NAME}" = "v$(jq -r .version package.json)"
      - name: Setup node
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          package-manager-cache: false
          registry-url: https://registry.npmjs.org
      - name: Upgrade npm
        run: npm install -g npm@11
      - name: Setup pnpm
        run: corepack enable
      - name: Get pnpm cache directory
        shell: bash
        run: echo "pnpm_cache_dir=$(pnpm store path)" >> ${GITHUB_ENV}
      - name: Use pnpm cache
        uses: actions/cache@v5
        with:
          path: ${{ env.pnpm_cache_dir }}
          key: ubuntu-22.04-x64-node-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ubuntu-22.04-x64-node-
      - name: Install pnpm dependencies
        id: install-pnpm
        run: timeout 300 pnpm install --color=always --prefer-offline --frozen-lockfile
        continue-on-error: true
      - name: Install pnpm dependencies (retry)
        if: steps.install-pnpm.outcome == 'failure'
        run: timeout 300 pnpm install --color=always --prefer-offline --frozen-lockfile
      - name: Build packages
        run: pnpm --color=always --stream build
      - name: Pack packages
        run: pnpm --color=always --stream pack
      - name: Publish npm packages
        id: publish-npm
        run: |
          case "${GITHUB_REF_NAME}" in
            *-*) dist_tag=next;;
            *) dist_tag=latest;;
          esac
          pnpm --color=always publish -r --no-git-checks --tag ${dist_tag}
        env:
          NPM_CONFIG_PROVENANCE: "true"
        continue-on-error: true
      - name: Publish npm packages (retry)
        id: publish-npm-2
        if: steps.publish-npm.outcome == 'failure'
        run: |
          case "${GITHUB_REF_NAME}" in
            *-*) dist_tag=next;;
            *) dist_tag=latest;;
          esac
          pnpm --color=always publish -r --no-git-checks --tag ${dist_tag}
        env:
          NPM_CONFIG_PROVENANCE: "true"
        continue-on-error: true
      - name: Publish npm packages (retry 2)
        if: steps.publish-npm-2.outcome == 'failure'
        run: |
          case "${GITHUB_REF_NAME}" in
            *-*) dist_tag=next;;
            *) dist_tag=latest;;
          esac
          pnpm --color=always publish -r --no-git-checks --tag ${dist_tag}
        env:
          NPM_CONFIG_PROVENANCE: "true"
      - name: Create release
        uses: softprops/action-gh-release@v2
        with:
          fail_on_unmatched_files: true
          files: |-
            *.tgz
```

- [ ] **Step 2: Validate workflow YAML**

Run: `pnpm trunk:check`

Expected: no errors for `.github/workflows/release.yaml`.

- [ ] **Step 3: Commit when requested**

```sh
git add .github/workflows/release.yaml
git commit -m "Add npm and GitHub release workflow"
```

### Task 5: Document Maintainer Release Process

**Files:**
- Create: `RELEASE.md`

- [ ] **Step 1: Add release runbook**

````markdown
# Release process

Publishing a release is automated after maintainer starts version bump. npm
uses trusted publishing, so no npm access token exists in GitHub.

## Required setup

Before first release:

- Create GitHub Environments `automated` and `publishing`; add required
  reviewers if release approval is desired.
- Add repository secret `GH_TOKEN` with permission to create and force-push
  `automated/npm-version`, create or edit pull requests, and create tags.
- Configure npm trusted publishing for package
  `@freelensapp/opencode-extension`, repository
  `freelensapp/freelens-for-opencode-extension`, workflow
  `.github/workflows/release.yaml`, environment `publishing`.

## Step 1: Start version bump

Open **Actions -> Automated npm version -> Run workflow**. Select input
`newversion`:

| Input | Purpose | Example |
| --- | --- | --- |
| `patch` | Bug fix | `0.1.0` -> `0.1.1` |
| `minor` | New backward-compatible feature | `0.1.0` -> `0.2.0` |
| `major` | Breaking change | `0.1.0` -> `1.0.0` |
| `prerelease` | Development preview | `0.1.0` -> `0.1.1-0` |

Workflow creates or updates `automated/npm-version` PR with `package.json` and
lockfile version change.

## Step 2: Review version pull request

Review CI and version change, then merge PR into `main`. Merged stable version
starts **Automated tag**. Pre-release version stays untagged on `main`.

If automatic tag is not created, close version PR and add `/tag` comment to its
issue. This fallback only acts on closed `Automated npm version` issues.

## Step 3: Automatic publication

**Automated tag** reads stable version from `package.json` and creates
`vX.Y.Z` on `main`. Pushed tag starts **Release**, which:

1. Verifies tag equals `v` plus `package.json` version.
2. Installs dependencies, builds extension, and packs `.tgz`.
3. Publishes stable versions to npm `latest`; prerelease versions to `next`.
4. Creates GitHub Release with `.tgz` attachment.

## Step 4: Start next development cycle

Run **Automated npm version** with `prerelease`, review its PR, and merge it.

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

[Maintainer] workflow_dispatch -> Automated npm version (prerelease)
                                      |
                          prerelease PR merged to main
                                      v
                           next development version on main
```

## Pre-release checklist

- `pnpm lint:check`, `pnpm type:check`, and `pnpm test:unit` pass on `main`.
- Verify extension against supported Freelens version.
- Confirm `publishing` environment and npm trusted publisher are configured.
````

- [ ] **Step 2: Validate Markdown**

Run: `pnpm trunk:check`

Expected: no errors for `RELEASE.md`.

- [ ] **Step 3: Commit when requested**

```sh
git add RELEASE.md
git commit -m "Document extension release process"
```

### Task 6: Verify Package and Release Assets

**Files:**
- Verify: `.github/workflows/npm-version.yaml`
- Verify: `.github/workflows/tag.yaml`
- Verify: `.github/workflows/release.yaml`
- Verify: `RELEASE.md`
- Verify: `.nvmrc`

- [ ] **Step 1: Run static checks**

Run: `pnpm trunk:check; pnpm lint:check; pnpm type:check; pnpm test:unit`

Expected: all commands exit 0.

- [ ] **Step 2: Build extension**

Run: `pnpm build`

Expected: exit 0 and output contains `out/main/index.js` and
`out/renderer/index.js`.

- [ ] **Step 3: Pack extension**

Run: `pnpm pack`

Expected: exit 0 and writes `freelensapp-opencode-extension-<version>.tgz` in
repository root.

- [ ] **Step 4: Inspect package contents**

Run: `tar -tf freelensapp-opencode-extension-*.tgz`

Expected: archive includes `package/out/main/index.js` and
`package/out/renderer/index.js`.

- [ ] **Step 5: Remove generated package artifact**

Run: `Remove-Item -LiteralPath "freelensapp-opencode-extension-<version>.tgz"`

Expected: generated tarball is removed; source changes remain limited to
workflow, version pin, and documentation files.

- [ ] **Step 6: Commit when requested**

```sh
git status --short
git add .nvmrc .github/workflows/npm-version.yaml .github/workflows/tag.yaml .github/workflows/release.yaml RELEASE.md
git commit -m "Automate extension npm releases"
```
