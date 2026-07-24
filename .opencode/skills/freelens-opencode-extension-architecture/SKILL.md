# freelens-opencode-extension — Architecture

Two-process Electron extension. Main: `LensMainExtension` with two IPC handlers
(`check-opencode-installed`, `get-agent-workdir`) backed by pure modules under
`src/main/`. Renderer: `LensRendererExtension` registering one cluster page +
menu (`agent-session`); the page is a MobX `observer` status card that calls
`Renderer.Component.createTerminalTab` + `terminalStore.sendCommand` to launch
`opencode` in a built-in terminal dock tab with `KUBECONFIG` inherited from
the active cluster's auth proxy.

Runtime globals (`@freelensapp/extensions`, `mobx`, `react`, ...) injected by
the Freelens host. Build-time: only types. No runtime deps in `package.json`.