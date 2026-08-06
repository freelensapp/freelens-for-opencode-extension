# Contributing

## Prerequisites

- Node.js >= 22
- pnpm 10
- Freelens >= 1.8.0
- [opencode](https://opencode.ai/docs/) installed and on PATH

## Setup

```sh
pnpm install
```

## Build

```sh
pnpm build        # emits out/main/index.js + out/renderer/index.js
pnpm dev          # electron-vite dev watch (if wired)
```

## Test

```sh
pnpm test:unit    # vitest
pnpm type:check   # tsc --noEmit
pnpm lint:check   # biome
```

The renderer page is a thin shell over Freelens public APIs and is
smoke-tested manually — no component unit tests.

## Pack and install

### One-shot

```sh
pnpm build
pnpm pack          # produces @freelensapp/opencode-extension-x.y.z.tgz
```

Open Freelens → Extensions (`Ctrl+Shift+E`) → drag the `.tgz` into the
window. Enable the extension.

### Symlink for faster iteration

**macOS / Linux:**

```sh
ln -s /full/path/to/freelens-opencode-extension \
  ~/.local/share/Freelens/extensions/freelens-opencode-extension
```

**Windows (junction):**

```powershell
New-Item -ItemType Junction -Path "$env:LOCALAPPDATA\Freelens\extensions\freelens-opencode-extension" -Target "C:\full\path\to\freelens-opencode-extension"
```

Then `pnpm build` and reload Freelens (`Ctrl+R` / `Cmd+R`).

## Debug

- **Renderer errors:** `Ctrl+Shift+I` in Freelens → Console tab.
- **Main process errors:** launch Freelens from a terminal; logs prefixed
  `[EXTENSION]:` appear on stdout. The Extensions page also shows
  activation errors.

## Architecture

Two-process Electron extension mirroring the Freelens extension model:

- **Main** (`src/main/`) — registers IPC handlers for checking opencode,
  managing harness files, and revealing paths. Pure modules: opencode
  detection, workdir resolution, scaffold seeding, and safe file I/O.
- **Renderer** (`src/renderer/`) — sidebar registration, the agent session
  page (MobX observer), and terminal dock tab launch via Freelens public
  APIs. `KUBECONFIG` is inherited from the active cluster's auth proxy by
  Freelens' built-in terminal infrastructure.

Host-injected globals (`@freelensapp/extensions`, `mobx`, `react`) come
from the Freelens host. The only bundled runtime dependency is Monaco
Editor (`monaco-editor` + `@monaco-editor/react`).

## Windows

Opencode native Windows support is in progress upstream. WSL is the
recommended path. When running on `win32`, the status page prints a
warning.
