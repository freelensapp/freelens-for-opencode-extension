# freelens-opencode-extension — Gotchas

- `Renderer.Catalog.activeCluster` is a `computed` returning a catalog
  `KubernetesCluster | null` entity, NOT a `ClusterInfo` DTO. Use
  `Renderer.Catalog.getActiveCluster()` to read `{ id, kubeConfigPath,
  contextName, ... }`.
- IPC channels are auto-prefixed `extensions@<sanitized-ext-id>:<channel>`;
  both `Main.Ipc.handle` and `Renderer.Ipc.invoke` agree on the prefix, so
  bare channel names ("check-opencode-installed") suffice.
- The built-in terminal sets `env.KUBECONFIG = proxyKubeconfigPath` for the
  active cluster at `shell-session.ts:384`. The extension never reads or
  mutates this — just opens a terminal tab and sends a command.
- `sendCommand` resolves only after the shell is ready (it `await`s
  `terminalApi.isReady`); the click handler can ignore the returned Promise.
- `createTerminalTab` auto-selects + opens the dock — no separate focus call.
- On Windows, opencode works best under WSL. The page banner warns if
  `process.platform === "win32"`.
- Build stack filenames: `electron.vite.config.js` (not `.ts`) and
  `biome.jsonc` (not `.json`). Vendored helper: `build/global-externals.js`.