# freelens-opencode-extension — Architecture

Two-process Electron extension. Main: `LensMainExtension` with five IPC
handlers (`check-opencode-installed`, `prepare-harness`, `read-harness-file`,
`write-harness-file`, `reveal-path`) backed by pure modules under `src/main/`.
Renderer: `LensRendererExtension` registering one cluster page + menu
(`agent-session`); the page is a MobX `observer` status card that calls
`Renderer.Component.createTerminalTab` + `terminalStore.sendCommand` to launch
`opencode` in a built-in terminal dock tab with `KUBECONFIG` inherited from
the active cluster's auth proxy, and renders an in-app Monaco editor for
`AGENTS.md` plus a Reveal-workdir button.

Runtime globals (`@freelensapp/extensions`, `mobx`, `react`, ...) injected by
the Freelens host. Monaco is the exception — `monaco-editor` and
`@monaco-editor/react` are the extension's first runtime deps (bundled into
`out/renderer/` via Vite `?worker` imports, shipped in the `.tgz`).

## Per-cluster provider workspace (phase 1)

Every cluster session gets a persistent `.opencode/` tree under
`<userData>/ai-cli-sessions/<safe-id>/opencode/`, seeded from a bundled k8s-aware
scaffold on first open (`ensure-harness.ts`). `get-provider-workdir.ts` computes
this path with `computeProviderWorkdir()`; its safe cluster ID replaces unsupported
characters and appends a short digest. Main registers four IPC
handlers (`prepare-harness`, `read-harness-file`, `write-harness-file`,
`reveal-path`) — all on the `opencode-extension:` prefix. Every read/write
routes through `safeResolve(workdir, relPath)` in `harness-file.ts`, which
anchors against `realpathSync(workdir)` to prevent path escape. The old
`get-agent-workdir` IPC handler was dropped (`prepare-harness` returns the
workdir); `prepareOpenCodeHarness()` moves an existing legacy OpenCode workspace
before seeding the provider workspace.
The renderer page (`agent-session-page.tsx`) calls `prepare-harness` once on
load and renders a Monaco-based `AGENTS.md` editor with debounced autosave
plus a Reveal workdir button. `monaco-editor` + `@monaco-editor/react` are
the extension's first runtime deps; bundled under `out/renderer/` via Vite
`?worker` imports, offline (`loader.config({ monaco })`).
