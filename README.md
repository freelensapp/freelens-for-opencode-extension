# @freelensapp/opencode-extension

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Run an OpenCode AI agent session scoped to any Kubernetes cluster, straight
from the Freelens sidebar. One click launches `opencode` in a docked terminal
tab with `KUBECONFIG` wired, a k8s-aware harness pre-seeded, and an in-app
AGENTS.md editor.

<img src="docs/images/freelens-opencode-screenshot.png" width="800" alt="OpenCode in Freelens sidebar">

## Why

Operating Kubernetes clusters means constant context-switching between
Freelens and a separate terminal for AI-assisted work. This extension
collapses that gap. Click **OpenCode** under any cluster and you get a
fully-provisioned opencode session inside Freelens — same KUBECONFIG, same
workspace, zero configuration.

## Features

- **One-click sessions** — click the sidebar entry, get a terminal dock
  tab running opencode pre-cd'd into the cluster workspace.
- **Per-cluster isolation** — each cluster gets its own workdir at
  `<userData>/opencode-sessions/<cluster-id>/`. Sessions never collide.
- **K8s-aware harness** — `AGENTS.md`, `skills`, `mcp`, `custom agents` and **any opencode feature** is
  available automatically. Editable at any time.
- **In-app AGENTS.md editor** — full Monaco editor inside Freelens with
  debounced autosave and theme matching.
- **Permission editor** — edit `.opencode/opencode.json` in-app. Tune which shell commands the AI agent can run (e.g.
  read-only kubectl, deny destructive mutations).
- **Pre-flight check** — probes your PATH for opencode upfront. If it's
  missing you see a clear banner with a retry button.
- **Zero bundled binary** — you install opencode once on your system; the
  extension uses it. Works on macOS, Linux, and Windows (WSL recommended).

## Quick start

### 1. Install opencode

[Download and install opencode](https://opencode.ai/docs/) for your
platform. The extension detects it via `PATH` — it does not bundle or
update opencode.

### 2. Install the extension

Open Freelens, go to **Extensions** ... TDB

### 3. Launch a session

Click **OpenCode** in any cluster sidebar. A terminal tab opens,
navigates to the cluster workspace, and starts opencode. Repeat per
cluster — each session is independent.

## How it works

Each cluster gets a persistent workspace:

```
<userData>/opencode-sessions/<safe-cluster-id>/
  .opencode/
    opencode.json          # kubectl permission rules
  AGENTS.md                # your cluster-specific instructions
```

On first open, the extension copies a bundled scaffold into the workdir
with safe k8s defaults (read-only kubectl, deny destructive mutations).
After that the harness is yours — edit `AGENTS.md` in the in-app
editor, or reveal the workdir in your file manager to edit everything
with your own tools. Every opencode feature is scoped to that cluster:
skills, MCPs, custom instructions, agents, and permission rules.

**Reset:** delete the `.opencode/` directory inside the workdir and
reopen the session. The scaffold re-seeds clean.

## Developing

Dev setup, build, test, and debugging instructions live in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © 2025-2026 Freelens Authors
