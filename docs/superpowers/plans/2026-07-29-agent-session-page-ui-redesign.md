# Agent Session Page UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline-styled Agent Session page with native Freelens host components (`Renderer.Component.*`), confine "green" to a single status badge, group all actions into one toolbar, and add a Reset action backed by a new `reset-harness` IPC handler.

**Architecture:** Single-file renderer rewrite over host components (`SubTitle`, `StatusBrick`, `Button`, `Icon`, `Gutter`, `ConfirmDialog`, `Notifications`) — no new renderer files, no custom CSS, no new deps. Main process gains one pure function `resetHarness(workdir)` plus a 6th IPC handler `opencode-extension:reset-harness`. `ensureHarness` becomes per-file no-clobber so a reset (which deletes only `.opencode/`) re-seeds the harness without destroying the user's edited `AGENTS.md`.

**Tech Stack:** Electron extension, TypeScript 5.9, React 17, MobX, electron-vite + Vite 8, vitest 4, `node:fs` (rmSync/cpSync/readdirSync/statSync/copyFileSync, Node ≥22).

---

## Spec reconciliation (read before implementing)

The approved spec is `docs/superpowers/specs/2026-07-29-agent-session-page-ui-redesign-design.md`. Three deviations from its literal text are required by the actual host API; each is a correctness fix, not a scope change.

### 1. `ConfirmDialog.confirm`, not `ConfirmDialog.open`

Spec §3 says:

> after `ConfirmDialog.open({ message, ok: "Delete", cancel: "Cancel" })` confirms, invoke `reset-harness`

Two problems with that literal call:

- `ConfirmDialog.open` has type `(params: ConfirmDialogParams) => void` — it is **fire-and-forget** (it just sets dialog state). It returns nothing, so the renderer cannot `await` the user's choice. Source: `freelens/packages/core/src/renderer/components/confirm-dialog/open.injectable.ts:12`.
- The param keys are wrong for what the spec means. `ConfirmDialogBooleanParams` (`freelens/packages/core/src/renderer/components/confirm-dialog/confirm-dialog.tsx:35-42`) uses **`labelOk` / `labelCancel`** for button labels. The `ok` / `cancel` keys on `ConfirmDialogParams` are *callbacks*, not labels.

The promise-returning variant is `ConfirmDialog.confirm(params): Promise<boolean>` (`confirm.injectable.ts:12-28`), which resolves `true` on OK and `false` on Cancel. So the plan uses:

```ts
const ok = await Renderer.Component.ConfirmDialog.confirm({
  message: "…",
  labelOk: "Delete",
  labelCancel: "Cancel",
});
if (!ok) return;
```

`ConfirmDialog` (with `open` + `confirm` attached) is exported to extensions via `freelens/packages/core/src/extensions/renderer-api/components.ts:122-125`.

### 2. `ensureHarness` must not clobber a user-edited `AGENTS.md` after a reset

Spec §3's reset flow is: `resetHarness` deletes `.opencode/`, then `refresh()` re-runs `prepare-harness`, which calls `ensureHarness`. But the current `ensureHarness` (`src/main/ensure-harness.ts:18-22`) gates only on `.opencode/` existence and otherwise does `cpSync(scaffoldDir, workdir, { recursive: true })`. The scaffold contains **`AGENTS.md` at its root** (see `src/main/scaffold/`). So after a reset removes `.opencode/`, the next `ensureHarness` re-copies the scaffold **including `AGENTS.md`**, silently destroying the user's edits. The existing "preserves user-edited AGENTS.md across a second call" test only passes because the *second* call finds `.opencode/` still present and returns early — reset deliberately removes that gate.

Root-cause fix (smallest diff that holds for every caller, per ponytail): make `ensureHarness` per-file no-clobber — never overwrite a target entry that already exists. The fast path (`.opencode/` present → `seeded:false`) stays; only the re-seed branch becomes per-file. This:

- preserves the existing 6 `ensureHarness` tests unchanged (verified against each case below), and
- makes reset safe: after `resetHarness` deletes `.opencode/`, a re-seed recreates `.opencode/opencode.json` but skips the user's root `AGENTS.md`.

The spec's files-touched table lists `ensure-harness.ts` as "Add `resetHarness(workdir)` export" only. This plan also modifies the `ensureHarness` body (the no-clobber fix) and adds one extra test beyond the spec's "+1" (the clobber-regression test), bringing the main-process suite to 39, not the spec's projected 38. Both additions are necessary for the reset feature to behave as the spec promises.

### 3. Install link: native `Button plain href`, not a raw `<a class="link">`

Spec §2 (missing state) prescribes:

> a raw `<a href="https://opencode.ai/docs/" target="_blank" rel="noreferrer">` styled with the host's `link` CSS class

There is no global `.link` class in the host (grepped `packages/core/src/renderer/**/*.scss` for `^.link {` / `^a.link {` — none). `Button` (`freelens/packages/ui-components/button/src/button.tsx:50-58`) renders as an `<a>` when given `href` + `target="_blank"`, with native Button styling — which is the "native Freelens look" the spec's *goal* asks for. So the plan renders the install link as `<Button plain href="https://opencode.ai/docs/" target="_blank">opencode docs</Button>`. One line, guaranteed consistent with the host.

### 4. AGENTS.md header stays inside `AgentsMdEditor` (unchanged)

The spec layout diagram shows "SubTitle AGENTS.md + save badge". But the spec's files-touched table marks `src/renderer/agents-md-editor.tsx` **Unchanged**, and that component already renders its own `<strong>AGENTS.md</strong>` + save badge (`src/renderer/agents-md-editor.tsx:98-101`). The diagram is shorthand; `SubTitle` wraps only the top "Agent Session" title. `agents-md-editor.tsx` is not touched by this plan.

---

## File structure

```
src/main/ensure-harness.ts          change — add resetHarness(workdir); rewrite ensureHarness as per-file no-clobber
src/main/ensure-harness.test.ts     change — add 2 tests (resetHarness deletes .opencode/ & safe when absent; re-seed preserves user AGENTS.md after reset)
src/main/index.ts                   change — add resetHarness import + 6th IPC handler `reset-harness`
src/renderer/agent-session-page.tsx change — full rewrite over host components; drop all inline color/border styles; add Reset + ConfirmDialog + Notifications toast for reveal/reset failures
```

Files NOT created (deliberate ponytail decisions, called out in the spec):
- No `reset-harness.test.ts` IPC test — `ipcMain.handle` is an Electron host concern; the pure `resetHarness` is the unit under test.
- No renderer component test — page remains a thin shell over public APIs (host components + `ipcRenderer.invoke` + Monaco). Manual smoke-only, unchanged from the existing `ponytail: no test for this page` comment.

---

## Task 1: `resetHarness` + per-file no-clobber `ensureHarness` (TDD)

**Files:**
- Modify: `src/main/ensure-harness.ts`
- Modify: `src/main/ensure-harness.test.ts`

- [ ] **Step 1: Add the two failing tests**

Append to `src/main/ensure-harness.test.ts` (inside the existing file, after the `describe("ensureHarness", …)` block, add two new `describe` blocks at the bottom). The imports at the top of the file already include `existsSync`, `mkdirSync`, `mkdtempSync`, `readFileSync`, `rmSync`, `writeFileSync` from `node:fs`, `tmpdir` from `node:os`, `path`, and `afterEach`/`beforeEach`/`describe`/`expect`/`it` from `vitest`. Add `resetHarness` to the existing import line `import { ensureHarness } from "./ensure-harness";`:

```ts
import { ensureHarness, resetHarness } from "./ensure-harness";
```

Then append these two blocks at the end of the file:

```ts
describe("resetHarness", () => {
  it("deletes .opencode/ when present", () => {
    ensureHarness(workdir, SCAFFOLD);
    expect(existsSync(path.join(workdir, ".opencode", "opencode.json"))).toBe(true);

    resetHarness(workdir);

    expect(existsSync(path.join(workdir, ".opencode"))).toBe(false);
    // root AGENTS.md is NOT touched by reset
    expect(existsSync(path.join(workdir, "AGENTS.md"))).toBe(true);
  });

  it("is safe when .opencode/ is absent (no throw)", () => {
    expect(() => resetHarness(workdir)).not.toThrow();
    expect(existsSync(path.join(workdir, ".opencode"))).toBe(false);
  });
});

describe("ensureHarness after resetHarness (no-clobber re-seed)", () => {
  it("re-creates .opencode/ but preserves a user-edited AGENTS.md at root", () => {
    ensureHarness(workdir, SCAFFOLD);
    writeFileSync(path.join(workdir, "AGENTS.md"), "# my custom agent\n", "utf8");
    resetHarness(workdir);
    expect(existsSync(path.join(workdir, ".opencode"))).toBe(false);

    const result = ensureHarness(workdir, SCAFFOLD);

    expect(result.seeded).toBe(true);
    expect(existsSync(path.join(workdir, ".opencode", "opencode.json"))).toBe(true);
    expect(readFileSync(path.join(workdir, "AGENTS.md"), "utf8")).toBe("# my custom agent\n");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:unit -- src/main/ensure-harness.test.ts`
Expected: FAIL — `resetHarness` is not exported (module has no such export). The first new test errors with `resetHarness is not a function` / import resolution failure.

- [ ] **Step 3: Rewrite `ensure-harness.ts` with `resetHarness` + per-file no-clobber `ensureHarness`**

Replace the entire contents of `src/main/ensure-harness.ts` with:

```ts
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { ensureWorkdir } from "./get-agent-workdir";
import { resolveScaffoldDir } from "./scaffold-source";

export interface PrepareHarnessResult {
  workdir: string;
  seeded: boolean;
}

// ponytail: scaffold layout mirrors the harness layout (.opencode/opencode.json
// + AGENTS.md at root) so seeding copies the scaffold into the workdir.
// ensureHarness is per-file no-clobber: a target entry that already exists
// (e.g. a user-edited AGENTS.md left behind by resetHarness) is skipped on
// re-seed. The fast path (.opencode/ present → seeded:false) stays.
export function ensureHarness(workdir: string, scaffoldDir: string = resolveScaffoldDir()): PrepareHarnessResult {
  ensureWorkdir(workdir);
  const opencodeDir = path.join(workdir, ".opencode");
  if (existsSync(opencodeDir)) {
    return { workdir, seeded: false };
  }
  let seeded = false;
  for (const entry of readdirSync(scaffoldDir)) {
    const src = path.join(scaffoldDir, entry);
    const dst = path.join(workdir, entry);
    if (existsSync(dst)) continue;
    const stat = statSync(src);
    if (stat.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      cpSync(src, dst, { recursive: true });
    } else {
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
    seeded = true;
  }
  return { workdir, seeded };
}

// resetHarness deletes only .opencode/ (the scaffolded config dir). The user's
// root AGENTS.md is preserved; a subsequent prepare-harness re-seeds .opencode/
// without clobbering it (see ensureHarness no-clobber branch).
export function resetHarness(workdir: string): void {
  const target = path.join(workdir, ".opencode");
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
```

Notes for the implementer:
- Existing 6 tests still pass with this rewrite:
  - "seeds when .opencode/ absent" → neither `.opencode/` nor `AGENTS.md` exist → loop copies both. ✓
  - "is idempotent" → `.opencode/` exists → fast path returns `seeded:false`, fs untouched. ✓
  - "preserves user-edited AGENTS.md across a second call" → second call fast-paths on `.opencode/`. ✓
  - "does not follow a user-placed symlink… on a second call" → second call fast-paths, no fs touch. ✓
  - "propagates errors when the scaffold dir does not exist" → `readdirSync(scaffoldDir)` throws. ✓
  - "creates the workdir if it does not yet exist" → `ensureWorkdir` mkdirs, `.opencode/` absent → loop copies both. ✓

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:unit -- src/main/ensure-harness.test.ts`
Expected: PASS — all 6 existing tests + 3 new tests (resetHarness deletes; resetHarness safe when absent; re-seed preserves user AGENTS.md) = 9 tests in this file.

- [ ] **Step 5: Run the full main-process test suite to confirm nothing else regressed**

Run: `pnpm test:unit`
Expected: PASS — every `src/main/*.test.ts` and `src/renderer/get-launch-command.test.ts` suite green.

- [ ] **Step 6: Commit**

```bash
git add src/main/ensure-harness.ts src/main/ensure-harness.test.ts
git commit -m "Add resetHarness and per-file no-clobber ensureHarness"
```

---

## Task 2: `reset-harness` IPC handler (6th handler)

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add the `resetHarness` import**

In `src/main/index.ts`, change the existing import line (line 4):

```ts
import { ensureHarness } from "./ensure-harness";
```

to:

```ts
import { ensureHarness, resetHarness } from "./ensure-harness";
```

- [ ] **Step 2: Register the `reset-harness` handler**

In `src/main/index.ts`, inside `onActivate()`, add a 6th handler immediately after the existing `reveal-path` handler (after the closing `});` of the `reveal-path` handler, before the method's closing `}`). The new handler validates the workdir is under the sessions root (via the existing `assertSessionsWorkdir` already imported on line 6) before deleting:

```ts
    ipcMain.handle(`${CHANNEL_PREFIX}reset-harness`, async (_event, workdir: string) => {
      try {
        const realWd = assertSessionsWorkdir(app.getPath("userData"), workdir);
        resetHarness(realWd);
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
      }
    });
```

Why `assertSessionsWorkdir` first: `resetHarness` does `rmSync(path.join(workdir, ".opencode"), { recursive, force })`. A renderer-supplied workdir outside `<userData>/opencode-sessions/` must be rejected before any deletion — `assertSessionsWorkdir` (`src/main/harness-file.ts:26-36`) already anchors against `realpathSync(userData)` and throws `Forbidden workdir` on escape. Note we pass the **returned `realWd`** (the realpath'd, validated value) into `resetHarness`, not the raw renderer argument.

- [ ] **Step 3: Run type-check + unit tests**

Run: `pnpm type:check`
Expected: PASS — no type errors (handler is typed; `err: any` matches the existing handlers' style on lines 26/39/48/59).

Run: `pnpm test:unit`
Expected: PASS — handler has no unit test (Electron host concern), existing suites unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "Add reset-harness IPC handler"
```

---

## Task 3: Rewrite `agent-session-page.tsx` over host components

**Files:**
- Modify: `src/renderer/agent-session-page.tsx` (full rewrite)

- [ ] **Step 1: Replace the file with the host-component version**

Replace the entire contents of `src/renderer/agent-session-page.tsx` with:

```tsx
import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import { AgentsMdEditor } from "./agents-md-editor";
import { getLaunchCommand } from "./get-launch-command";

// ponytail: extension uses raw electron ipcRenderer directly instead of the
// Renderer.Ipc abstraction exported by @freelensapp/extensions. Reason:
// Renderer.Ipc is published as the ABSTRACT CLASS IpcRenderer (not an
// instance); its `invoke` method is an instance method, so
// Renderer.Ipc.invoke(...) does not typecheck against
// @freelensapp/extensions@1.10.2's declarations. Raw ipcRenderer + hardcoded
// channel prefix matches the main side (Task 6). Upgrade path: if a future
// Freelens release exposes a concrete per-extension IpcRenderer instance,
// switch back to get the auto-prefixed channel + auto-cleanup disposers.
const CHANNEL_PREFIX = "opencode-extension:";

type Status = "loading" | "ready" | "missing" | "error";

interface PageState {
  status: Status;
  version?: string;
  workdir?: string;
  error?: string;
}

interface OpencodeCheckResult {
  installed: boolean;
  version?: string;
  error?: string;
}

interface PrepareHarnessResult {
  workdir: string;
  seeded: boolean;
}

interface ResetHarnessResult {
  ok: boolean;
  error?: string;
}

interface RevealPathResult {
  ok: boolean;
  error?: string;
}

interface AgentSessionPageProps {
  extension: Renderer.LensExtension;
}

export const AgentSessionPage = observer(function AgentSessionPage({
  extension: _extension,
}: AgentSessionPageProps) {
  const [state, setState] = useState<PageState>({ status: "loading" });

  const clusterId = Renderer.Catalog.getActiveCluster()?.id ?? null;

  async function refresh() {
    setState({ status: "loading" });
    try {
      if (!clusterId) {
        setState({ status: "error", error: "No active cluster. Open a cluster first." });
        return;
      }
      const [check, harness] = await Promise.all([
        ipcRenderer.invoke(`${CHANNEL_PREFIX}check-opencode-installed`) as Promise<OpencodeCheckResult>,
        ipcRenderer.invoke(`${CHANNEL_PREFIX}prepare-harness`, clusterId) as Promise<PrepareHarnessResult>,
      ]);
      if (!check.installed) {
        setState({ status: "missing", error: check.error, workdir: harness.workdir });
        return;
      }
      setState({ status: "ready", version: check.version, workdir: harness.workdir });
    } catch (err: any) {
      setState({ status: "error", error: err?.message ?? String(err) });
    }
  }

  useEffect(() => {
    void refresh();
    // refresh runs on clusterId change only; `refresh` identity is stable per render but lint rule is off in biome.jsonc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  function launch() {
    if (state.status !== "ready" || !state.workdir) return;
    const tabId = Renderer.Component.createTerminalTab({ title: "Agent Session" }).id;
    const launchCmd = getLaunchCommand(state.workdir, process.platform);

    let sent = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const send = () => {
      if (sent) return;
      sent = true;
      clearInterval(poll);
      clearTimeout(timeoutId);
      void Renderer.Component.terminalStore.sendCommand(launchCmd, { tabId, enter: true });
    };

    const poll = setInterval(() => {
      const api = (Renderer.Component.terminalStore as any).getTerminalApi?.(tabId);
      if (api?.isReady) send();
    }, 100);
    timeoutId = setTimeout(send, 15_000);
  }

  async function reveal() {
    if (!state.workdir) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reveal-path`, state.workdir)) as RevealPathResult;
    if (!result.ok) {
      // ponytail: transient reveal failures surface as a host toast, not inline red text (spec §2).
      Renderer.Component.Notifications.error(`Reveal failed: ${result.error ?? "unknown"}`);
    }
  }

  async function reset() {
    if (state.status !== "ready" || !state.workdir) return;
    // ConfirmDialog.confirm returns Promise<boolean> (true=ok, false=cancel).
    // ConfirmDialog.open is fire-and-forget and cannot be awaited — see plan's spec reconciliation §1.
    const ok = await Renderer.Component.ConfirmDialog.confirm({
      message: "Delete .opencode/ and re-seed the scaffold? Your AGENTS.md is preserved.",
      labelOk: "Delete",
      labelCancel: "Cancel",
    });
    if (!ok) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reset-harness`, state.workdir)) as ResetHarnessResult;
    if (!result.ok) {
      Renderer.Component.Notifications.error(`Reset failed: ${result.error ?? "unknown"}`);
      return;
    }
    await refresh();
  }

  return (
    <div>
      <Renderer.Component.SubTitle title="Agent Session">
        {state.status === "ready" && (
          <>
            <Renderer.Component.StatusBrick className="running" /> opencode v{state.version}
          </>
        )}
        {state.status === "loading" && (
          <>
            <Renderer.Component.StatusBrick className="waiting" /> Checking for opencode…
          </>
        )}
        {(state.status === "missing" || state.status === "error") && (
          <Renderer.Component.StatusBrick className="failed" />
        )}
      </Renderer.Component.SubTitle>

      {state.status === "missing" && (
        <div>
          <Renderer.Component.Icon material="error_outline" />
          <span>opencode not found on PATH</span>
          <Renderer.Component.Button plain href="https://opencode.ai/docs/" target="_blank">
            opencode docs
          </Renderer.Component.Button>
          {state.error && <span>{state.error}</span>}
          <Renderer.Component.Button outlined label="Retry" onClick={() => void refresh()} />
        </div>
      )}

      {state.status === "error" && (
        <div>
          <Renderer.Component.Icon material="error_outline" />
          <span>{state.error}</span>
          <Renderer.Component.Button outlined label="Retry" onClick={() => void refresh()} />
        </div>
      )}

      {state.status === "ready" && state.workdir && (
        <>
          <div>
            Working directory: <code>{state.workdir}</code>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
            <Renderer.Component.Button primary label="Open agent session" onClick={launch} disabled={!clusterId} />
            <Renderer.Component.Button outlined label="Reveal workdir" onClick={() => void reveal()} />
            <Renderer.Component.Button
              outlined
              tooltip="Delete .opencode/ to reseed scaffold"
              onClick={() => void reset()}
            >
              <Renderer.Component.Icon material="restart_alt" small />
              Reset
            </Renderer.Component.Button>
          </div>
          <Renderer.Component.Gutter />
          <AgentsMdEditor workdir={state.workdir} />
        </>
      )}

      {/* ponytail: no test for this page — it's a thin shell over public APIs
          (createTerminalTab + sendCommand + ipcRenderer.invoke + Monaco + host
          components). Manual smoke only. */}
    </div>
  );
});
```

Implementer notes:
- All inline `color` / `border` / green-box styles from the old file are gone. The only inline `style` left is the toolbar flex layout (`display:flex; gap:8px; marginTop:0.5rem`) — structural layout, not visual styling; matches the existing inline-flex pattern in `agents-md-editor.tsx:97-98`. Host component SCSS handles all colors.
- `StatusBrick` className map: `running` = green (ready), `waiting` = orange (loading), `failed` = red X (missing/error). Verified at `freelens/packages/core/src/renderer/components/status-brick/status-brick.scss:29-50`.
- `copyResetPath` and its pseudo-link `<p>` are deleted — the Reset button + ConfirmDialog replaces that workaround.
- The `reveal()` failure path no longer mutates `state` (spec §2: no inline red text); it calls `Notifications.error(...)`. Host `Notifications.error` is exported to extensions at `freelens/packages/core/src/extensions/renderer-api/components.ts:127-133`.
- `Button` renders as an `<a>` when given `href` + `target="_blank"` (`freelens/packages/ui-components/button/src/button.tsx:50-58`), so the install link is a real hyperlink with native Button styling.
- `Button` is wrapped with `withTooltip`, so the `tooltip` prop renders the Reset button tooltip (`freelens/packages/ui-components/tooltip/src/withTooltip.tsx:12-22`). `Icon`'s `small` prop sizes the leading icon.
- `SubTitle`'s children render inline next to its title (`freelens/packages/core/src/renderer/components/layout/sub-title.tsx:22-35`), so the StatusBrick + label sit to the right of "Agent Session" as the spec diagram shows.

- [ ] **Step 2: Run lint + type-check + unit tests**

Run: `pnpm lint:fix`
Expected: PASS — biome formats the file; no lint errors. The `useExhaustiveDependencies` rule is off in `biome.jsonc:64` so the existing `eslint-disable-next-line react-hooks/exhaustive-deps` comment is harmless (biome ignores it; it's kept for any future eslint run).

Run: `pnpm type:check`
Expected: PASS — `Renderer.Component.*` resolves against `@freelensapp/extensions@^1.10.2` (the dev dependency). `Button`, `Icon`, `SubTitle`, `StatusBrick`, `Gutter`, `ConfirmDialog`, `Notifications` are all re-exported through `Renderer.Component` (verified at `freelens/packages/core/src/extensions/renderer-api/components.ts`). `Button`'s `tooltip` is provided by `withTooltip` so it is in the merged props type.

Run: `pnpm test:unit`
Expected: PASS — the page has no unit test (smoke-only); `get-launch-command.test.ts` and the main suites are unaffected.

- [ ] **Step 3: Build the extension**

Run: `pnpm build`
Expected: PASS — electron-vite bundles main + renderer. `prebuild` (`pnpm type:check`) runs first. No new deps, no `electron.vite.config.js` change, so the existing Monaco worker + scaffold-copy config is undisturbed.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/agent-session-page.tsx
git commit -m "Redesign agent session page over host components"
```

---

## Task 4: Manual smoke + pack (project AGENTS.md rule)

**Files:** none (verification only)

The project's `AGENTS.md` rule ("at the end of each implementation session, build and pack the extension") and the spec's Testing section both require a manual smoke of the page plus a `pnpm pack`. There is no automated harness for the page — it is a thin shell over host APIs and Monaco.

- [ ] **Step 1: Install the built extension into a running Freelens**

Load `out/` (or the packed tarball from Step 3) into a running Freelens per the existing manual smoke procedure used for this extension. Open a cluster, then click "Agent Session" in the cluster menu.

- [ ] **Step 2: Verify the ready state**

With `opencode` on PATH and an active cluster:
- "Agent Session" SubTitle at top; a **green** StatusBrick + "opencode v\<X\>" to its right. No green border or green text anywhere else on the page.
- "Working directory: \<path\>" as plain text with a `<code>` path, no border.
- A single button toolbar: **Open agent session** (primary), **Reveal workdir** (outlined), **Reset** (outlined, leading `restart_alt` icon, tooltip "Delete .opencode/ to reseed scaffold").
- Gutter spacer, then the AGENTS.md editor with its existing header + save badge.
- Clicking "Open agent session" launches a terminal tab running `opencode` in the workdir (unchanged launch logic).
- Clicking "Reveal workdir" opens the host file explorer at the workdir.

- [ ] **Step 3: Verify Reset (the new flow)**

- Click "Reset". A ConfirmDialog opens with message "Delete .opencode/ and re-seed the scaffold? Your AGENTS.md is preserved.", buttons "Delete" / "Cancel".
- Cancel: dialog closes, nothing changes.
- Edit AGENTS.md in the editor (type something, wait for "Saved" badge), then click Reset → Delete. After the dialog closes, the page re-runs `prepare-harness`. Confirm:
  - `.opencode/opencode.json` is back (the harness re-seeded).
  - Your AGENTS.md edit is still present (the no-clobber fix from Task 1 works end-to-end). If the edit was lost, stop — the Task 1 fix did not take.
- Force a reveal failure (e.g. delete the workdir out of band, then click "Reveal workdir"): a transient `Notifications.error` toast appears; the page state is unchanged (no inline red text).

- [ ] **Step 4: Verify loading / missing / error states**

- **Loading**: briefly on first open — orange StatusBrick + "Checking for opencode…".
- **Missing opencode**: rename/PATH-hide `opencode`, reopen the page — red `failed` StatusBrick, `error_outline` icon, "opencode not found on PATH", the "opencode docs" link opens `https://opencode.ai/docs/`, "Retry" button re-runs `refresh()`. No green anywhere.
- **Error (no cluster)**: with no active cluster, the page shows red `failed` StatusBrick + `error_outline` + "No active cluster. Open a cluster first." + "Retry".

- [ ] **Step 5: Run the project gates**

Run each in order:

```bash
pnpm lint:fix
pnpm type:check
pnpm test
pnpm build
pnpm pack
```

Expected: all PASS. `pnpm pack` (npm built-in — there is no `pack` script in `package.json`) produces `freelensapp-opencode-extension-0.1.0.tgz` at the project root (refreshing the existing tarball). `pnpm test` is `vitest run` — the full unit suite: the 9 `ensure-harness` tests (6 original + 3 new), all other main suites, and `get-launch-command.test.ts`.

- [ ] **Step 6: Commit any plan-fix derived from smoke findings (if needed) and stage the packed tarball**

Typically no commit is needed here — Task 1–3 commits already cover the change. If a smoke step revealed a defect that required an edit, commit that fix now under its own message (e.g. `fix: reset flow preserves AGENTS.md`); otherwise skip this step.

The packed `freelensapp-opencode-extension-0.1.0.tgz` is the build artifact, not source — leave it gitignored (it already lives in the working tree from prior sessions; do not commit it unless the repo already tracks it).

---

## Self-review

**1. Spec coverage**

- §1 Ready-state layout: SubTitle "Agent Session" + green StatusBrick + "opencode vX" ✓ (Task 3); workdir plain `<code>` ✓; button toolbar (Open primary, Reveal outlined, Reset outlined + restart_alt + tooltip) ✓; Gutter before the editor ✓; no outer border / no green box ✓.
- §2 Loading/missing/error states: `waiting` brick + "Checking for opencode…" ✓; `failed` brick + `error_outline` icon + message + install link + Retry ✓; `failed` brick for error + Retry ✓; reveal failures as `Notifications.error` toast, no inline red ✓.
- §3 reset-harness IPC handler: `resetHarness(workdir)` export ✓ (Task 1); `opencode-extension:reset-harness` 6th handler with `assertSessionsWorkdir` guard ✓ (Task 2); renderer ConfirmDialog confirm → invoke → refresh ✓ (Task 3).
- Files touched table: `agent-session-page.tsx` rewrite ✓; `agents-md-editor.tsx` unchanged ✓; `ensure-harness.ts` add `resetHarness` ✓ (plus no-clobber fix per reconciliation §2); `ensure-harness.test.ts` add test ✓ (plus the clobber-regression test per reconciliation §2); `index.ts` add 6th handler ✓; `package.json` / `electron.vite.config.js` unchanged ✓.
- Constraints: no new runtime deps ✓; no new renderer files ✓; no custom CSS (only structural flex layout, matching existing pattern) ✓.
- Testing: new `resetHarness` test ✓; manual smoke checklist ✓; gates `lint:fix`/`type:check`/`test`/`build`/`pack` ✓.

**2. Placeholder scan**

No TBD/TODO/"fill in"/"similar to Task N" found. Every code step contains full code. The renderer rewrite is shown in full in Task 3 Step 1, not summarized.

**3. Type consistency**

- `ResetHarnessResult { ok: boolean; error?: string }` — declared in Task 3 and used by the `reset-harness` handler return in Task 2 (`{ ok: true }` / `{ ok: false, error }`) ✓.
- `RevealPathResult { ok: boolean; error?: string }` — matches the existing `reveal-path` handler's `revealPath(...)` return and the renderer's existing usage ✓.
- `resetHarness(workdir: string): void` — declared in Task 1, imported and called in Task 2 ✓.
- `ensureHarness(workdir, scaffoldDir?)` signature unchanged from current ✓.
- `ConfirmDialog.confirm({ message, labelOk, labelCancel })` → `Promise<boolean>` — matches `confirm.injectable.ts:12` ✓.
- `Notifications.error(message)` — matches `components.ts:127-133` ✓.
- `StatusBrick` className values `running` / `waiting` / `failed` — all present in `status-brick.scss:29,44,48` ✓.

No gaps, no placeholders, types consistent.