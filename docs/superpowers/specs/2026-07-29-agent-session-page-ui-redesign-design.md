# Agent Session Page UI Redesign

**Date:** 2026-07-29
**Status:** Approved
**Project:** freelens-opencode-extension

## Problem

The Agent Session page UI is ugly:

1. A green border + green text wraps the entire "ready" block — green should be limited to the opencode detection check only.
2. Buttons are raw `<button>` elements with no distinguishable styling — they don't read as buttons.
3. Buttons are scattered: "Open agent session" is alone, "Reveal workdir" is in its own `<div>`, "Reset" is a `<p>` pretending to be a link.
4. All styling is inline — no visual consistency with the rest of Freelens.

## Goal

Redesign the page to use Freelens host components (`Renderer.Component.*`) so it looks native, restricts green to a single status badge, and groups all buttons into one toolbar.

## Decisions (from brainstorming)

| Question | Answer |
|----------|--------|
| Visual consistency | Native Freelens look — use `Renderer.Component.*`, zero custom CSS |
| Ready-state layout | Toolbar + sections: SubTitle, status badge, button toolbar, editor |
| Green scope | Status badge only (StatusBrick + green dot next to "opencode vX detected") |
| Error/missing states | `StatusBrick className="failed"` (red) + `Icon material="error_outline"` + text + `Button` Retry; transient errors via `Notifications.error` toast. (`Notice` is not exported by `Renderer.Component` — see Component Availability note.) |
| Reset action | Outlined Button in toolbar + `ConfirmDialog` + new `reset-harness` IPC handler that deletes `.opencode/` |
| Code approach | A — single file refactor, no new renderer files |

## Design

### Section 1: Ready-state layout

```
┌─────────────────────────────────────────────────┐
│ Agent Session                      [● opencode vX]│  SubTitle + StatusBrick (green)
├─────────────────────────────────────────────────┤
│ Working directory: /path/to/workdir              │  plain text, <code> for path
│                                                   │
│ [Open agent session] [Reveal workdir] [Reset]     │  Button toolbar: primary, outlined, outlined
├─────────────────────────────────────────────────┤
│ AGENTS.md                              [Saved ✓]   │  SubTitle + save badge (unchanged)
│ ┌─────────────────────────────────────────────┐   │
│ │ Monaco editor (markdown)                    │   │  unchanged
│ │                                             │   │
│ └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

- **SubTitle** "Agent Session" at top, with **StatusBrick** (green) + "opencode vX" to its right. Green lives only here.
- Workdir shown as plain text `<code>` below subtitle — no border, no green.
- **Button toolbar**: single flex row.
  - `Open agent session` → `Renderer.Component.Button primary`
  - `Reveal workdir` → `Renderer.Component.Button outlined`
  - `Reset` → `Renderer.Component.Button outlined` with `Renderer.Component.Icon material="restart_alt"` + tooltip "Delete .opencode/ to reseed scaffold"
- **Gutter** spacer between toolbar and editor section.
- **SubTitle** "AGENTS.md" + existing save badge. Monaco editor below — unchanged.
- NO outer border around the page. NO green box. Sections separated by SubTitle + Gutter.

### Section 2: Loading / missing / error states

The StatusBrick at the top of the page adapts to the state — same badge slot for all states, only the `className` changes:

- **Loading**: `StatusBrick className="waiting"` (orange) + plain text "Checking for opencode…".
- **Missing opencode**: `StatusBrick className="failed"` (red) + `Icon material="error_outline"` + "opencode not found on PATH" + install link (`Renderer.Component` does not export `<a>` — use a raw `<a href="https://opencode.ai/docs/" target="_blank" rel="noreferrer">` styled with the host's `link` CSS class) + `Button outlined` "Retry" → `refresh()`. No green anywhere.
- **Error**: `StatusBrick className="failed"` (red) + `Icon material="error_outline"` + error message + `Button outlined` "Retry" → `refresh()`.
- **Reveal failures**: transient `Renderer.Component.Notifications.error(...)` toast, no inline red text, page state unchanged.

#### Component availability note

`Notice` (`freelens/packages/core/src/renderer/components/extensions/notice.tsx`) is used by host pages like `cluster-settings/kubeconfig.tsx` but is **not** re-exported through the extension API (`@freelensapp/extensions` → `@freelensapp/core` → `renderer-api/components.d.ts`). Only the components listed in `components.d.ts` lines 7–68 are available to extensions. `StatusBrick` (line 60) is exported and supports colored variants via className (`running` = green, `failed` = red, `waiting` = orange) per `status-brick.scss`. `Notifications` (lines 78–84) exposes `.error`, `.ok`, `.info` toast methods.

### Section 3: `reset-harness` IPC handler

New export `resetHarness(workdir)` in `src/main/ensure-harness.ts`:

```typescript
export function resetHarness(workdir: string): void {
  const target = path.join(workdir, ".opencode");
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
```

New IPC handler `opencode-extension:reset-harness` in `src/main/index.ts` (6th handler):

```typescript
ipcMain.handle(`${CHANNEL_PREFIX}reset-harness`, async (_event, workdir) => {
  try {
    assertSessionsWorkdir(workdir);
    resetHarness(workdir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
```

Renderer: after `ConfirmDialog.open({ message, ok: "Delete", cancel: "Cancel" })` confirms, invoke `reset-harness`, then `refresh()` re-runs `prepare-harness` which re-seeds `.opencode/` from scaffold (existing idempotent `ensureHarness` logic).

## Files touched

| File | Change |
|------|--------|
| `src/renderer/agent-session-page.tsx` | Full rewrite — host components, toolbar, ConfirmDialog, Notifications. Drop all inline styles. |
| `src/renderer/agents-md-editor.tsx` | Unchanged (Monaco bundling stays). |
| `src/main/ensure-harness.ts` | Add `resetHarness(workdir)` export. |
| `src/main/ensure-harness.test.ts` | Add test: `resetHarness` deletes `.opencode/` and is safe when absent. |
| `src/main/index.ts` | Add `reset-harness` IPC handler (6th). |
| `package.json` | Unchanged. |
| `electron.vite.config.js` | Unchanged. |

## Constraints

- **No new runtime deps.** Host `MonacoEditor` only supports `language: "yaml" | "json"` — no markdown, so our bundled `monaco-editor` + `@monaco-editor/react` stay.
- **No new renderer files.** Single page, one call site per element — decomposition would be speculative abstraction.
- **No custom CSS.** All styling comes from host components' compiled SCSS.

## Testing

- One new test in `ensure-harness.test.ts` for `resetHarness` (deletes `.opencode/`, safe when absent): brings total from 37 to 38 tests.
- Page remains smoke-tested manually (thin shell over host APIs + Monaco + ipcRenderer).
- Gates: `pnpm lint:fix`, `pnpm type:check`, `pnpm test`, `pnpm build`, `pnpm pack` (per project AGENTS.md rule).