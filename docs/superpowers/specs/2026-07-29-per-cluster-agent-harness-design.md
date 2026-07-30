# Per-Cluster Agent Harness — Design

**Date:** 2026-07-29
**Project:** `freelens-for-opencode-extension`
**Status:** Approved via brainstorming — pending implementation plan

## Problem

The opencode extension currently launches a bare `opencode` process in a per-cluster
scratch directory. There is no editable configuration, no persistent instructions,
and no k8s-aware guardrails. Every cluster session starts empty and unprotected.

Users want a **persistent, editable, custom agent harness** for every cluster:
the full `.opencode/` tree (opencode.json + AGENTS.md + future skills/agents) that
survives across session launches, can be edited at will, and starts from sane
per-cluster defaults.

## Scope (phase 1)

- **Full `.opencode/` tree** as the harness, living inside the per-cluster workdir
  the extension already manages. opencode reads it as its project config
  automatically (it runs from that dir).
- **Bundled k8s-aware default scaffold** (`opencode.json` + `AGENTS.md`), shipped
  with the extension, copied into a fresh workdir on first open.
- **Seed-on-missing policy**: the extension writes the scaffold only when
  `.opencode/` is missing. If the user deletes `.opencode/` by hand, the next
  `prepare-harness` re-seeds it — that is the *only* reset path. No version
  marker, no migrations, no reset button.
- **Phase-1 UI**: the existing status card stays, plus (a) a "Reveal workdir"
  button and (b) a Monaco-based in-app editor for `AGENTS.md` with debounced
  autosave. No editor for other harness files yet.
- **Editing**: primary UX is the filesystem (user edits any harness file in their
  own editor via the revealed workdir path). The in-app editor is a convenience
  for `AGENTS.md` only.

## Out of scope (future phases)

- opencode.json editor UI.
- Skill browser / subagent config / MCP server config UI.
- User global template, per-cluster template chooser.
- Harness version marker / migration logic.
- "Reset harness" button — deletion-and-reopen is the documented reset path.

## Harness layout

```
<userData>/opencode-sessions/<safe-cluster-id>/
  .opencode/
    opencode.json
  AGENTS.md
```

The `.opencode/skills/`, `.opencode/agent/`, etc. subdirectories are not seeded in
phase 1 — the dir is open for the user to drop more into by hand via filesystem.

## Bundled scaffold

Shipped with the extension, version-controlled, copied into the workdir on seed:

```
src/main/scaffold/
  opencode.json
  AGENTS.md
```

Copied recursively into the workdir by `ensure-harness` when `.opencode/` is
missing. After that, fully user-owned.

### `scaffold/opencode.json` (permissions-only, no model)

```json
{
  "permission": {
    "edit": "allow",
    "bash": {
      "default": "ask",
      "deny": [
        "kubectl delete",
        "kubectl delete -f",
        "kubectl edit",
        "kubectl scale --replicas=0",
        "kubectl rollout undo",
        "kubectl drain",
        "kubectl cordon",
        "kubectl taint"
      ],
      "allow": [
        "kubectl get",
        "kubectl describe",
        "kubectl logs",
        "kubectl top",
        "kubectl explain",
        "kubectl api-resources",
        "kubectl api-versions",
        "kubectl version"
      ]
    },
    "webfetch": "ask"
  },
  "notify": { "error": true }
}
```

No `"model"` key — the user chooses the model after seeding (in opencode.json,
via opencode's own settings, or via their filesystem editor).

### `scaffold/AGENTS.md` (k8s-aware stub)

```markdown
# Cluster agent

You are operating against a Kubernetes cluster via `kubectl`. `KUBECONFIG` is already set.

Conventions:
- Inspect before mutating: `kubectl get` / `describe` / `logs` before any apply or scale.
- Dry-run first: `kubectl apply -f <file> --dry-run=server -o yaml`.
- Namespaces: always pass `--namespace`, never default.
- Never delete a resource without asking for confirmation.
- Prefer `kubectl rollout status` over `kubectl rollout undo` unless explicitly asked.

Cluster notes (edit here):
- 
```

## Architecture — Approach C

Two distinct concerns, two IPC shapes, one security choke point.

### IPC handlers (all on existing `opencode-extension:` prefix)

1. **`prepare-harness(clusterId)` → `{ workdir: string, seeded: boolean }`**
   - Compute workdir via existing `computeWorkdir`.
   - `mkdir -p` the workdir.
   - If `.opencode/` missing inside it → copy `scaffold/` in recursively,
     `seeded = true`. Else `seeded = false`, touch nothing.
   - Main owns scaffold contents; renderer does not parameterize seeding.

2. **`read-harness-file(workdir, relPath)` → `{ content: string, exists: boolean }`**
   - Validates `workdir` matches the prep shape
     `<userData>/opencode-sessions/<safe-id>/`. Rejects otherwise.
   - Escape-guards `relPath` via `safeResolve`.
   - Reads the file utf8. Returns `{content:"", exists:false}` if missing — no
     throw (editor shows empty + "file not seeded yet").

3. **`write-harness-file(workdir, relPath, content)` → `{ ok: true, bytes: number }`**
   - Same validation + escape guard.
   - `writeFile` utf8. `mkdir -p` parent dirs first (lets renderer create new
     files in the harness later — e.g. dropping skills via UI).
   - Never writes outside the validated workdir.

4. **`reveal-path(absPath)` → `{ ok: boolean }`**
   - Validates `absPath` is inside `<userData>/opencode-sessions/`.
   - `shell.openPath(absPath)` (Electron — opens Explorer / Finder / xdg-open).

### The security boundary — `safeResolve(workdir, relPath)`

Every read/write call routes through this pure function before touching disk:

```ts
function safeResolve(workdir: string, relPath: string): string {
  if (path.isAbsolute(relPath) || relPath.includes("\0")) throw new Error("Forbidden path");
  const normalizedRel = relPath.replace(/\//g, path.sep);
  if (path.isAbsolute(normalizedRel)) throw new Error("Forbidden path");
  const realWorkdir = fs.realpathSync(workdir);     // anchor every call — cheap, stateless
  const resolved = path.resolve(realWorkdir, normalizedRel);
  const wd = realWorkdir;
  const sep = path.sep;
  const inside =
    resolved.toLowerCase() === wd.toLowerCase() ||
    resolved.toLowerCase().startsWith(wd.toLowerCase() + sep.toLowerCase());
  if (!inside) throw new Error("Forbidden path");
  return resolved;
}
```

Cross-platform correctness:
- `realpathSync(workdir)` anchors once and collapses `..` and (on POSIX) follows
  symlinks so a symlink pointing outside is caught at the workdir anchor.
- Case-insensitive drive-letter compare (Windows).
- Forward-slash → `path.sep` normalization before resolve (renderer may send
  `foo/bar`).
- Reject absolute `relPath` and NUL bytes.

### Existing IPC handlers — unchanged

`check-opencode-installed` and `get-agent-workdir` stay. `get-agent-workdir` is
made redundant by `prepare-harness` (which also computes the workdir), but we
keep both for the phase-1 transition — `get-agent-workdir` remains the way to
fetch the path without side effects (used by the existing Open flow until the
page is reworked). We'll remove it only if the new page no longer calls it.

(Review gate: the implementation plan will decide whether the new page still
calls `get-agent-workdir`. If it only calls `prepare-harness`, we drop the old
handler. If it uses both for now, we keep both.)

## Renderer page

### Existing status card

Unchanged: opencode detected v…, working directory, Open agent session button.

### New harness panel — renders only when `status === "ready"`

```
[Reveal workdir]                            ← calls reveal-path(workdir)

[AGENTS.md editor (Monaco)]                ← in markdown mode
  status badge top-right:
    "Saved" (green, 1s after write ok)
    "Saving…" (amber, during write)
    "Save failed: <err>" (red, sticky until next successful write)
  debounced autosave 500ms after onChange

"Reset: delete .opencode/ then reopen"     ← grey footer,
                                              click copies path to clipboard
```

No Save button. Monaco `onChange` → debounce 500ms → `write-harness-file`.
On `prepare-harness` success, renderer calls
`read-harness-file(workdir, "AGENTS.md")` to load. If `exists:false`, editor
starts empty and the first Save creates the file (happens only if the user
manually deleted AGENTS.md — the scaffold always writes one).

On `write-harness-file` failure: editor badge goes red and sticky; the in-memory
Monaco content is preserved (no clear) so the user can copy it out before
closing. No data loss path — write happens after edit, not before.

### Monaco loading — fully offline

- `monaco-editor` (the npm package) as a real runtime dependency.
- `@monaco-editor/react` wrapper, configured with
  `loader.config({ monaco })` to use that local `monaco-editor` namespace.
- No CDN URL, no network dependency at runtime.
- Vite's `?worker` import in `electron.vite.config.js` bundles Monaco's
  editor workers into `out/renderer/`; they load from there.

## Files (new / changed)

```
src/main/scaffold/opencode.json           new — default harness config
src/main/scaffold/AGENTS.md                new — k8s-aware instructions stub
src/main/ensure-harness.ts                new — seed-on-missing (pure over workdir + scaffold path)
src/main/ensure-harness.test.ts           new — temp dir, seed, idempotent, no-clobber, malformed
src/main/scaffold-source.ts               new — locates scaffold dir (bundled at out/main/scaffold)
src/main/harness-file.ts                  new — safeResolve + safeRead/safeWrite helpers
src/main/harness-file.test.ts             new — escape-prevention tests (POSIX + Windows cases)
src/main/reveal-path.ts                   new — shell.openPath wrapper + path validation
src/main/index.ts                         change — add 4 IPC handlers
src/renderer/agent-session-page.tsx        change — add Reveal + Monaco editor + harness state
src/renderer/agents-md-editor.tsx          new — Monaco wrapper w/ load/edit/autosave
electron.vite.config.js                   change — Monaco worker bundling, renderer optimizeDeps
package.json                               change — add monaco-editor + @monaco-editor/react as runtime deps
```

## Dependencies

- `monaco-editor` — runtime dep. New. Bundled into `out/renderer/` at build.
- `@monaco-editor/react` — runtime dep. Wrapper for the above.
- Both shipped in the extension `.tgz` via `files: ["out/**/*"]`. Pack size
  jumps by ~1–2MB. Acceptable trade for in-app editor UX.

This is the extension's first runtime dependency. The README's "runtime globals
injected by the Freelens host" claim no longer holds for Monaco specifically —
document it in the README update that comes with implementation.

## Testing

Pure modules get unit tests (vitest), matching the existing pattern
(`check-opencode-installed`, `get-agent-workdir`):

- **`ensure-harness.test.ts`** — temp-dir fixture:
  1. Seeds when `.opencode/` absent → both files present, `seeded === true`.
  2. Idempotent — second call `seeded === false`, files untouched (content hash preserved).
  3. User-edited file preserved across second call.
  4. Realpath-anchored — symlink inside workdir pointing outside is NOT followed
     out of the workdir during seed copy (we copy the scaffold's real files, not
     the user's symlinks — scaffold has no symlinks).
  5. Malformed workdir → throws.

- **`harness-file.test.ts`** — `safeResolve` cross-platform cases:
  1. Relative path inside → ok.
  2. `..` escape → throws.
  3. Absolute `relPath` → throws.
  4. Windows-style backslashes mixed with `..` → throws.
  5. Forward-slash `relPath` (`AGENTS.md`, `foo/bar`) normalizes correctly.
  6. `safeRead` on missing file → `{exists:false}`.
  7. `safeWrite` creates parent dirs.
  8. UNC path as workdir → handled per Section "Cross-platform."

- **`reveal-path.test.ts`** — skipped. Thin wrapper over Electron
  `shell.openPath`. No test for an Electron API call. (ponytail: smoke-only.)

- **Renderer components** — smoke only, like the existing page. No component
  unit test. (`ponytail: no test for this page` comment already in
  `agent-session-page.tsx` — still applies; Monaco editor is part of that page.)

## Build & end-of-session

`pnpm build` emits `out/main/index.js`, `out/renderer/index.js`, the bundled
scaffold copy at `out/main/scaffold/`, and the bundled Monaco workers under
`out/renderer/`. `pnpm pack` produces the `.tgz` for install.

Per the project's `AGENTS.md` rule: at the end of each implementation session,
build and pack the extension.

## Worked-through flows

### First open of a cluster

1. User opens "Agent Session" page.
2. Renderer fetches active cluster id, calls `check-opencode-installed` and
   `prepare-harness(clusterId)` in parallel.
3. Main: computes workdir, `mkdir -p`, sees `.opencode/` missing → copies
   `scaffold/` in, returns `{workdir, seeded:true}`.
4. Renderer: if opencode detected, sets `status:"ready"`, calls
   `read-harness-file(workdir, "AGENTS.md")`.
5. Editor loads the seeded AGENTS.md, ready to edit.
6. User clicks Open agent session → terminal launches `opencode` in the
   workdir. opencode opens the harness as its config.

### Subsequent opens

1. Same as above but `prepare-harness` returns `seeded:false` — harness is not
   touched. Any edits the user made across sessions persist.

### Edit AGENTS.md

1. User types in Monaco → `onChange` → debounced 500ms →
   `write-harness-file(workdir, "AGENTS.md", content)`.
2. Badge: `Saving…` → `Saved` on success, `Save failed: <err>` on failure
   (sticky, content preserved in memory).

### Reset harness

1. User clicks "Reset: delete .opencode/ then reopen" footer (copies path to
   clipboard).
2. User opens their file manager via the Reveal button, deletes `.opencode/`,
   opens the Agent Session page again.
3. `prepare-harness` sees `.opencode/` missing → re-seeds from scaffold.

## Risk register

- **Monaco bundling under electron-vite + Electron renderer.** Workers under
  Vite's `?worker` plugin are well-trodden, but the specific combination
  (electron-vite + `@monaco-editor/react` + offline config) is not exercised
  in this extension yet. Fallback: textarea + autosave (the original second
  choice). Only escalate to that if Monaco bundling blocks the build.
- **`shell.openPath` on Windows.** Has historically had quirks. Fallback if it
  regresses: `shell.showItemInFolder(workdir)` (selects the folder in Explorer).
- **Engine: `node >=22`.** `fs.cpSync` recursive copy + all fs APIs used are
  stable on Node 22. No risk.
- **Pack size +1–2MB from Monaco.** Acceptable for phase 1; if users complain,
  move Monaco to a dynamic import loaded only when the editor mounts.

## Non-goals re-stated

- No "reset" button that creates destruction. Reset = delete `.opencode/` by
  hand → reopen. Phase 1.
- No migration or versioning of the scaffold. `seeded` is the only version
  signal, and it's a one-shot.
- No multi-file editor. AGENTS.md only in phase 1.
- No model selection in the extension. The scaffold ships no `model` key;
  opencode's own settings / model fallback decides.