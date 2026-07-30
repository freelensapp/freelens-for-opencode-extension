# @freelensapp/opencode-extension

A Freelens extension that adds a one-click **Agent Session** entry under each
cluster's sidebar. Clicking `[Open agent session]` launches a built-in Freelens
terminal dock tab running [`opencode`](https://opencode.ai) in a per-cluster
scratch directory. Because Freelens' built-in terminal already injects
`KUBECONFIG` pointing at the active cluster's auth proxy, every `kubectl` the
opencode agent runs hits the selected cluster with no extra context plumbing.

## Features

- Sidebar entry "Agent Session" on every cluster page.
- Pre-flight check: probes PATH for `opencode`; red banner + retry button if
  missing.
- Per-cluster isolated workdir under `<userData>/opencode-sessions/<safe-id>/`.
- One click → new terminal dock tab, auto-focused, running
  `cd "<workdir>" && opencode`. Each click = independent session.
- Zero bundled binary. Works on any OS where the user has installed opencode.
- Persistent, editable per-cluster agent harness under
  `<userData>/opencode-sessions/<safe-id>/.opencode/` + `AGENTS.md`. Seeded
  from a bundled k8s-aware scaffold on first open; survives across sessions;
  fully user-owned after seeding. Edit any harness file via the Reveal workdir
  button; AGENTS.md also editable in-app via Monaco.
- Bundled scaffold ships `opencode.json` k8s permission rules (allow read-only
  kubectl, deny destructive mutations, `webfetch=ask`) and a k8s-aware
  `AGENTS.md`.
- Reset path: delete `.opencode/` in the workdir (via Reveal) and reopen the
  Agent Session page — `prepare-harness` re-seeds. No reset button.

## Install

### 1. Install opencode separately

See <https://opencode.ai/docs/>. The extension does NOT install or update
opencode for you.

### 2. Install the extension

Drop the built `out/` directory into Freelens' extensions folder, or symlink
this repo into your local extensions dir per Freelens' documentation.

## Local testing

### Pack and install (one-shot)

```sh
pnpm build
pnpm pack          # produces @freelensapp/opencode-extension-0.1.0.tgz
```

Open Freelens → Extensions (`Ctrl+Shift+E` / `Cmd+Shift+E`) → drag the `.tgz`
into the window or use the file picker. Enable it.

### Symlink for faster iteration

```powershell
# Windows — junction to avoid rebuild copies
New-Item -ItemType Junction -Path "$env:LOCALAPPDATA\Freelens\extensions\freelens-opencode-extension" -Target "C:\full\path\to\freelens-opencode-extension"
```

```sh
# macOS / Linux
ln -s /full/path/to/freelens-opencode-extension ~/.local/share/Freelens/extensions/freelens-opencode-extension
```

Then: `pnpm build` → `Ctrl+R` / `Cmd+R` in Freelens to reload.

### Debug

- **Renderer errors:** `Ctrl+Shift+I` in Freelens → Console tab.
- **Main errors:** launch Freelens from a terminal; logs prefixed
  `[EXTENSION]:` appear on stdout. The Freelens Extensions page also shows
  activation errors.

## Build

```sh
pnpm install
pnpm build        # emits out/main/index.js + out/renderer/index.js
```

## Develop

```sh
pnpm dev          # if electron-vite dev is wired; otherwise build and reload host
```

## Test

```sh
pnpm test:unit    # vitest run — pure modules only (main helpers spec'd)
pnpm type:check   # tsc --noEmit
pnpm lint:check   # biome check
```

The renderer page is a thin shell over Freelens public APIs
(`Renderer.Component.createTerminalTab` /
`Renderer.Component.terminalStore.sendCommand` /
`Renderer.Catalog.getActiveCluster` /
`Renderer.Catalog.activeCluster.get()` /
raw `ipcRenderer.invoke`); it is smoke-tested manually — no component unit test.

## Architecture

Two-process Electron extension mirroring `freelens-example-extension`:

- **Main process** (`src/main/index.ts`) — `OpencodeMainExtension extends
  Main.LensExtension`, registers five IPC handlers via raw `electron.ipcMain`
  using a hardcoded `opencode-extension:` channel prefix (see Gotchas skill
  for why we don't use `Main.Ipc`): `check-opencode-installed`,
  `prepare-harness`, `read-harness-file`, `write-harness-file`, `reveal-path`.
  Backed by pure modules under `src/main/`: `check-opencode-installed.ts`
  (spawn `opencode --version`, parse, never reject),
  `get-agent-workdir.ts` (sanitize cluster id, ensure dir),
  `scaffold-source.ts` / `ensure-harness.ts` (seed the bundled harness on
  first open), `harness-file.ts` (the `safeResolve` security choke point),
  and `reveal-path.ts` (open the workdir in the OS file manager).
- **Renderer** (`src/renderer/`) — `OpencodeRendererExtension extends
  Renderer.LensExtension` registering one cluster page + menu
  (`agent-session`). The page is a MobX `observer` status card that calls
  `Renderer.Component.createTerminalTab` + `terminalStore.sendCommand` to
  launch `opencode` in a built-in terminal dock tab. `KUBECONFIG` is inherited
  from the active cluster's auth proxy by Freelens' built-in terminal infra
  — the extension never reads or mutates it.

Runtime globals (`@freelensapp/extensions`, `mobx`, `react`, ...) injected by
the Freelens host. Monaco is the exception — `monaco-editor` and
`@monaco-editor/react` are the extension's first runtime dependencies
(bundled into `out/renderer/` at build, shipped in the `.tgz`).

See `.opencode/skills/freelens-opencode-extension-architecture/SKILL.md`.

## Harness

Each cluster session has a persistent `.opencode/` tree under
`<userData>/opencode-sessions/<safe-cluster-id>/`:

```
<userData>/opencode-sessions/<safe-cluster-id>/
  .opencode/
    opencode.json
  AGENTS.md
```

On first open, the extension copies a bundled k8s-aware scaffold
(`src/main/scaffold/`) into the workdir. After that, the harness is fully
user-owned — edit any file in your own editor via the Reveal workdir button,
or edit `AGENTS.md` in the in-app Monaco editor (debounced autosave).
The scaffold ships no `"model"` key; choose your model via opencode's own
settings or by editing `opencode.json` manually.

Reset: delete `.opencode/` in the workdir and reopen the Agent Session page.
The extension re-seeds from the bundled scaffold. There is no in-app reset
button — deletion-and-reopen is the documented reset path.

## Windows note

opencode native Windows support is "still in progress" upstream; WSL is the
recommended path. The status page prints a warning when
`process.platform === "win32"`.