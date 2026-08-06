# Freelens AI CLI Design

## Summary

Generalize the OpenCode-only extension into Freelens AI CLI, an extension that launches a supported coding-agent CLI in a dedicated per-cluster workspace. Initial providers are OpenCode, Claude Code, and GitHub Copilot CLI. Provider support is compiled into the extension through a typed registry; this is not a runtime plugin system or a user-defined command launcher.

## Goals

- Show a static, ordered list of supported coding-agent CLIs.
- Probe only the provider selected by the user.
- Launch each provider with the active cluster's inherited `KUBECONFIG`.
- Isolate every cluster and provider in a dedicated workspace.
- Manage each provider's native instructions and useful project configuration in the existing in-app editor.
- Seed OpenCode and Claude Code with read-oriented permission defaults.
- Make a future provider a small code adapter plus scaffold and tests.
- Remove OpenCode-specific product, package, IPC, class, and workspace naming.

## Non-goals

- Runtime registration by third-party extensions.
- User-defined executable or argument profiles.
- Sharing files or configuration between provider workspaces.
- Migrating existing `opencode-sessions` workspaces. There are no current users requiring migration.
- Implementing a custom Copilot permission engine.
- Treating CLI permission prompts as a Kubernetes security boundary.

## Product Identity

- Product and sidebar name: **Freelens AI CLI**
- Package name: `@freelensapp/ai-cli-extension`
- IPC prefix: `ai-cli-extension:`
- Workspace root: `ai-cli-sessions`
- Code names: `AiCliProvider`, `AiCliMainExtension`, and `AiCliRendererExtension`

The repository directory can retain its current local name. Renaming the remote repository is an external repository-management operation; package metadata must continue to point at the real repository URL until that move occurs.

## Provider Registry

A shared, pure TypeScript registry is the source of truth for supported providers. It contains trusted static values only and is consumed by both Electron processes.

```ts
interface AiCliProvider {
  id: string;
  name: string;
  executable: string;
  versionArgs: string[];
  docsUrl: string;
  launchArgs: string[];
  editors: EditorDefinition[];
  resetPaths: string[];
}

const aiCliProviders = [/* static provider entries */] as const satisfies readonly AiCliProvider[];
type AiCliProviderId = (typeof aiCliProviders)[number]["id"];
```

`EditorDefinition` supplies relative path, title, Monaco language, and role (`instructions`, `permissions`, or `settings`). Scaffold directory is derived from provider ID. Provider IDs are stable storage and IPC identifiers.

Initial provider data:

| Provider | Executable | Version probe | Instructions | Project configuration | Permission editor |
| --- | --- | --- | --- | --- | --- |
| OpenCode | `opencode` | `opencode --version` | `AGENTS.md` | `.opencode/opencode.json` | Yes |
| Claude Code | `claude` | `claude --version` | `CLAUDE.md` | `.claude/settings.json` | Yes |
| Copilot CLI | `copilot` | `copilot --version` | `.github/copilot-instructions.md` | `.github/copilot/settings.json` | No |

Using `copilot --version` avoids the update check performed by `copilot version`.

Adding a provider requires one registry entry, its scaffold directory, and focused probe, launch, and scaffold tests. Classes, factories, data manifest interpretation, and runtime registration are intentionally excluded.

## Workspace Model

Each provider receives a separate persistent workspace:

```text
<userData>/ai-cli-sessions/<safe-cluster-id>/<provider-id>/
```

Provider switching never copies or shares manifests, instructions, settings, generated files, or agent state. Existing terminal sessions remain open when the page selector changes.

Main process computes workspace paths from a bounded, sanitized cluster ID and a registry-validated provider ID. Renderer never supplies an executable, launch arguments, or authoritative absolute workspace path.

## Selection and Probe Flow

The selector always renders every registry provider in fixed registry order. Unprobed providers display a neutral `Not checked` state.

First visit to a cluster:

1. No provider is selected and no process starts.
2. User selects a provider.
3. Renderer persists provider ID in extension-namespaced `localStorage`, keyed by cluster ID.
4. Main runs only selected provider's version probe.
5. On success, main prepares selected provider's workspace and renderer loads its editors.
6. On missing executable or failure, renderer shows provider-specific install documentation and Retry.

Returning visit:

1. Renderer restores saved provider for active cluster.
2. It probes only restored provider once.
3. Result is cached for page lifetime until Retry or provider change.

If a saved ID no longer exists in registry, renderer deletes it and returns to unselected first-visit state without probing.

Switching providers clears page state for previous provider, probes newly selected provider, and prepares only its dedicated workspace. Async operations carry a request generation or selected-provider check so stale responses cannot replace current provider state.

Provider UI state is `idle`, `checking`, `ready`, `missing`, or `error`. Probe timeout is five seconds. Retry acts only on selected provider.

## Launch Flow

After selected provider is ready:

1. Renderer creates a terminal tab titled `<Provider Name> Session`.
2. Existing terminal readiness logic waits for terminal API, retaining current timeout fallback.
3. A shared shell-safe command builder changes to selected workspace and launches provider executable with static launch arguments.
4. Freelens terminal infrastructure supplies active cluster `KUBECONFIG` and environment.

Windows PowerShell and POSIX quoting remain separate implementations. Provider command and arguments come from registry, while workspace path is quoted as untrusted data. Launch creates a new tab; it does not stop or reuse another provider's terminal.

## Scaffolds and Editors

Scaffolds live under provider-specific bundled directories and seed missing files without overwriting existing files.

OpenCode scaffold:

```text
AGENTS.md
.opencode/opencode.json
```

Claude Code scaffold:

```text
CLAUDE.md
.claude/settings.json
```

Copilot CLI scaffold:

```text
.github/copilot-instructions.md
.github/copilot/settings.json
```

OpenCode and Claude permission defaults auto-allow a documented set of known read-only `kubectl` and `helm` commands. Unmatched and mutating operations use each CLI's native prompt behavior. The scaffold does not enable permission bypass modes.

Copilot has no permission editor. Its native project configuration cannot persist the required `allow`, `ask`, and `deny` policy model. Copilot continues to use native prompts and project settings.

Existing Monaco editor becomes provider-neutral and renders registry editor definitions. Main permits reads and writes only for paths declared by selected provider. Unknown files and absolute or escaping paths are rejected.

Reset removes only provider-declared managed configuration files, then reseeds defaults. It preserves provider instruction files, user-created skills and agents, generated artifacts, and unrelated files. Reset confirmation names affected provider and files.

## IPC and Main-Process Responsibilities

Raw Electron IPC remains because published Freelens extension IPC APIs are abstract classes in the supported host version. Channels use the new `ai-cli-extension:` prefix.

Required operations:

- `check-provider(providerId)`
- `prepare-workspace(clusterId, providerId)`
- `read-provider-file(clusterId, providerId, relativePath)`
- `write-provider-file(clusterId, providerId, relativePath, content)`
- `reveal-workspace(clusterId, providerId)`
- `reset-provider(clusterId, providerId)`

Every handler validates provider ID against registry. Filesystem handlers derive workspace from IDs, validate relative path against provider editor/reset metadata, and enforce containment for both lexical paths and real existing targets or parent directories. A provider file path whose existing parent chain escapes through a symlink is rejected.

## Error Handling

- Missing executable is distinct from probe failure and links selected provider's docs.
- Spawn errors, non-zero exits, unknown version formats, and timeout produce provider-named messages.
- On exit zero, version parser uses first semantic version from combined stdout/stderr and otherwise displays trimmed output or `unknown`. On non-zero exit, stderr is included in error details.
- Workspace, file, reveal, and reset failures remain scoped to selected provider and surface inline or through existing Freelens notifications.
- Provider switching invalidates stale probe, preparation, and editor-load responses.
- One provider failure never probes or blocks another provider.

## Security

- Renderer cannot choose executable, command arguments, scaffold path, reset path, or arbitrary editable file.
- Main validates all provider IDs and derives all workspace paths.
- Traversal, NUL, and absolute paths are rejected. Existing targets and their nearest existing parent are resolved before reads/writes so nested symlinks cannot escape workspace.
- Permission files are convenience guardrails. They do not constrain direct Kubernetes API access, aliases, alternate binaries, MCP tools, or credentials inherited through `KUBECONFIG`.
- Documentation and page copy state that Kubernetes RBAC and kubeconfig permissions remain actual security boundary.

## Testing

Focused unit coverage will include:

- Registry IDs are unique and editor/reset paths are safe relative paths.
- Generic probe uses each provider's executable and arguments and handles success, missing executable, non-zero exit, unknown version, and timeout.
- Workdir derivation isolates cluster/provider combinations and sanitizes cluster IDs.
- Each scaffold seeds without clobbering and reset restores only managed config files.
- File access rejects traversal, undeclared files, and nested symlink escapes.
- Launch commands quote workspaces correctly on Windows and every supported POSIX platform for all three providers.
- Selection persistence restores per cluster, first visit remains unselected, provider switching probes only new selection, and stale results are ignored.
- Sidebar registration and package-facing metadata use Freelens AI CLI identity.

Monaco, raw Electron IPC, and host terminal rendering remain manual smoke-test boundaries. No broad component harness is added solely for this change.

## Documentation and Validation

README and development docs will describe all providers, installation links, isolated workspace layout, provider-specific managed files, permission differences, and extension rename. OpenCode-only claims and screenshots/copy will be removed or updated.

Implementation completion requires:

1. Biome formatting and checks.
2. TypeScript type-check.
3. Unit test suite.
4. Production build.
5. Extension package creation.
6. Manual smoke test for provider selection, switching, launch, reveal, editing, and reset where installed CLIs are available.

## Success Criteria

- First page visit starts no CLI probe.
- Selecting one provider probes no other provider.
- Returning to a cluster restores and probes only saved provider.
- OpenCode, Claude Code, and Copilot CLI launch in distinct cluster/provider workspaces.
- OpenCode and Claude expose native instruction and permission editors with read-oriented defaults.
- Copilot exposes native instruction and project settings editors without a misleading policy editor.
- Switching providers cannot display stale state or access another provider's workspace.
- Adding another compiled provider does not require changes to generic probe, workspace, IPC, selection, editor, or launch flows.
