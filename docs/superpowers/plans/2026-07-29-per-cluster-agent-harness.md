# Per-Cluster Agent Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every per-cluster opencode session a persistent, editable `.opencode/` harness (opencode.json + AGENTS.md) seeded from a bundled k8s-aware scaffold, plus an in-app Monaco editor for `AGENTS.md` and a Reveal-workdir button.

**Architecture:** Approach C from the design spec. Main process owns four IPC handlers (`prepare-harness`, `read-harness-file`, `write-harness-file`, `reveal-path`) over the existing `opencode-extension:` channel prefix, backed by pure modules under `src/main/`. A single `safeResolve(workdir, relPath)` choke point anchors every read/write against `realpathSync(workdir)` so no path escapes the per-cluster workdir. Renderer page calls `prepare-harness` once on load, then `read-harness-file`/`write-harness-file` for the AGENTS.md Monaco editor with debounced autosave.

**Tech Stack:** Electron extension, TypeScript, electron-vite + Rolldown/Vite 8, vitest 4, React 17, MobX, `monaco-editor` + `@monaco-editor/react` (new runtime deps), `node:fs.cpSync` (Node ≥22).

---

## Spec reconciliation (read before implementing)

The design spec lists the bundled scaffold as:

```
src/main/scaffold/
  opencode.json
  AGENTS.md
```

…but the harness layout it mandates is:

```
<workdir>/
  .opencode/
    opencode.json
  AGENTS.md
```

A single `fs.cpSync(scaffoldDir, workdir, { recursive: true })` only reproduces the target layout **if the scaffold layout already mirrors it**. So we implement the scaffold with a `.opencode/` subdir:

```
src/main/scaffold/
  .opencode/
    opencode.json
  AGENTS.md
```

`cpSync` then seeds the harness correctly. The spec's flat listing is treated as shorthand. A `ponytail:` comment in `ensure-harness.ts` records this.

---

## File structure

```
src/main/scaffold/.opencode/opencode.json    new  — default harness permissions config
src/main/scaffold/AGENTS.md                  new  — k8s-aware instructions stub
src/main/scaffold-source.ts                  new  — locates bundled scaffold dir (out/main/scaffold in prod, src/main/scaffold in tests)
src/main/scaffold-source.test.ts             new  — resolves scaffold dir
src/main/ensure-harness.ts                   new  — seed-on-missing (pure over workdir + scaffold path)
src/main/ensure-harness.test.ts              new  — seed, idempotent, no-clobber, propagates errors
src/main/harness-file.ts                     new  — assertSessionsWorkdir + safeResolve + safeRead/safeWrite
src/main/harness-file.test.ts                new  — escape-prevention + read/write behavior
src/main/reveal-path.ts                      new  — validates path inside sessions root + shell.openPath
src/main/index.ts                            change — replace get-agent-workdir handler with 4 new handlers
src/renderer/agents-md-editor.tsx            new  — Monaco wrapper (load/edit/debounced autosave + status badge)
src/renderer/agent-session-page.tsx          change — call prepare-harness, render Reveal + editor + footer
electron.vite.config.js                      change — Monaco worker bundling + renderer optimizeDeps + scaffold copy plugin
package.json                                 change — add dependencies: monaco-editor, @monaco-editor/react
README.md                                    change — document harness + first runtime dep
.opencode/skills/freelens-opencode-extension-architecture/SKILL.md  change — harness section
```

Files NOT created (deliberate ponytail decisions, called out in the spec):
- No `reveal-path.test.ts` — thin wrapper over Electron `shell.openPath`.
- No renderer component test — page remains a thin shell, smoke-only (existing `ponytail: no test for this page` comment still applies).

---

## Task 1: Bundled scaffold files

**Files:**
- Create: `src/main/scaffold/.opencode/opencode.json`
- Create: `src/main/scaffold/AGENTS.md`

- [ ] **Step 1: Create the scaffold `.opencode/opencode.json`**

Create `src/main/scaffold/.opencode/opencode.json` with exactly:

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

- [ ] **Step 2: Create the scaffold `AGENTS.md`**

Create `src/main/scaffold/AGENTS.md` with exactly:

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

---

## Task 2: `scaffold-source.ts` — locate the bundled scaffold dir

**Files:**
- Create: `src/main/scaffold-source.ts`
- Create: `src/main/scaffold-source.test.ts`

At build time the scaffold is copied to `out/main/scaffold/` (Task 8 wires the copy plugin). At runtime, `__dirname` of the bundled main is `out/main/`, so `path.join(__dirname, "scaffold")` resolves. In tests, `__dirname` is `src/main/`, so the same expression finds `src/main/scaffold/`. One function, both contexts.

- [ ] **Step 1: Write the failing test**

Create `src/main/scaffold-source.test.ts`:

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveScaffoldDir } from "./scaffold-source";

describe("resolveScaffoldDir", () => {
  it("points at a directory that contains AGENTS.md", () => {
    const dir = resolveScaffoldDir();
    expect(existsSync(path.join(dir, "AGENTS.md"))).toBe(true);
  });

  it("points at a directory that contains .opencode/opencode.json", () => {
    const dir = resolveScaffoldDir();
    expect(existsSync(path.join(dir, ".opencode", "opencode.json"))).toBe(true);
  });

  it("honors an explicit override (used by ensure-harness tests)", () => {
    const custom = path.join(__dirname, "scaffold");
    expect(resolveScaffoldDir(custom)).toBe(custom);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- src/main/scaffold-source.test.ts`
Expected: FAIL with `resolveScaffoldDir is not exported` (module missing).

- [ ] **Step 3: Write the implementation**

Create `src/main/scaffold-source.ts`:

```ts
import path from "node:path";

// In production, electron-vite bundles main to out/main/index.js and the
// scaffold is copied to out/main/scaffold/ (see copyScaffold plugin in
// electron.vite.config.js). __dirname === out/main, so this resolves the
// bundled copy. In tests, __dirname === src/main, so it finds the source
// scaffold directly — same relative layout.
export function resolveScaffoldDir(explicit?: string): string {
  return explicit ?? path.join(__dirname, "scaffold");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- src/main/scaffold-source.test.ts`
Expected: PASS (3 tests).

---

## Task 3: `ensure-harness.ts` — seed-on-missing

**Files:**
- Create: `src/main/ensure-harness.ts`
- Create: `src/main/ensure-harness.test.ts`

Pure over `(workdir, scaffoldDir)`. Uses `fs.cpSync` (Node ≥22 stable) for a recursive copy that mirrors the scaffold layout into the workdir.

- [ ] **Step 1: Write the failing test**

Create `src/main/ensure-harness.test.ts`:

```ts
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureHarness } from "./ensure-harness";

const SCAFFOLD = path.join(__dirname, "scaffold");

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "harness-"));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("ensureHarness", () => {
  it("seeds when .opencode/ absent — both files present at the harness layout", () => {
    const result = ensureHarness(workdir, SCAFFOLD);
    expect(result.seeded).toBe(true);
    expect(result.workdir).toBe(workdir);
    expect(existsSync(path.join(workdir, ".opencode", "opencode.json"))).toBe(true);
    expect(existsSync(path.join(workdir, "AGENTS.md"))).toBe(true);
  });

  it("is idempotent — second call seeded:false, files untouched", () => {
    ensureHarness(workdir, SCAFFOLD);
    const before = readFileSync(path.join(workdir, "AGENTS.md"), "utf8");
    const beforeJson = readFileSync(path.join(workdir, ".opencode", "opencode.json"), "utf8");

    const result = ensureHarness(workdir, SCAFFOLD);
    expect(result.seeded).toBe(false);

    const after = readFileSync(path.join(workdir, "AGENTS.md"), "utf8");
    const afterJson = readFileSync(path.join(workdir, ".opencode", "opencode.json"), "utf8");
    expect(after).toBe(before);
    expect(afterJson).toBe(beforeJson);
  });

  it("preserves user-edited AGENTS.md across a second call (no clobber)", () => {
    ensureHarness(workdir, SCAFFOLD);
    writeFileSync(path.join(workdir, "AGENTS.md"), "# my custom agent\n", "utf8");

    const result = ensureHarness(workdir, SCAFFOLD);
    expect(result.seeded).toBe(false);
    expect(readFileSync(path.join(workdir, "AGENTS.md"), "utf8")).toBe("# my custom agent\n");
  });

  it("does not follow a user-placed symlink out of the workdir on a second call", () => {
    ensureHarness(workdir, SCAFFOLD);
    const outside = mkdtempSync(path.join(tmpdir(), "outside-"));
    try {
      // ponytail: symlink escape test — second call (seeded:false) must not touch fs at all
      const link = path.join(workdir, "secret");
      try {
        mkdirSync(path.join(outside, "sensitive"), { recursive: true });
        writeFileSync(path.join(outside, "sensitive", "passwd"), "root:x:0:0", "utf8");
        // Symlink creation may throw on Windows without admin — guard the assertion.
        try {
          require("node:fs").symlinkSync(path.join(outside, "sensitive"), link, process.platform === "win32" ? "junction" : "dir");
        } catch {
          return; // cannot create symlink on this host — skip
        }
        const result = ensureHarness(workdir, SCAFFOLD);
        expect(result.seeded).toBe(false);
        expect(existsSync(path.join(link, "passwd"))).toBe(true);
      } finally {
        rmSync(link, { force: true });
      }
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("propagates errors when the scaffold dir does not exist", () => {
    expect(() => ensureHarness(workdir, path.join(workdir, "nope-scaffold"))).toThrow();
  });

  it("creates the workdir if it does not yet exist", () => {
    const nested = path.join(workdir, "nested", "deeper");
    const result = ensureHarness(nested, SCAFFOLD);
    expect(result.seeded).toBe(true);
    expect(existsSync(path.join(nested, "AGENTS.md"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- src/main/ensure-harness.test.ts`
Expected: FAIL with `ensureHarness is not exported`.

- [ ] **Step 3: Write the implementation**

Create `src/main/ensure-harness.ts`:

```ts
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { ensureWorkdir } from "./get-agent-workdir";
import { resolveScaffoldDir } from "./scaffold-source";

export interface PrepareHarnessResult {
  workdir: string;
  seeded: boolean;
}

// ponytail: scaffold layout mirrors the harness layout (.opencode/opencode.json
// + AGENTS.md at root) so a single cpSync(scaffoldDir -> workdir) seeds it.
// Spec's flat listing of scaffold files was shorthand — see plan's
// "Spec reconciliation" section.
export function ensureHarness(
  workdir: string,
  scaffoldDir: string = resolveScaffoldDir(),
): PrepareHarnessResult {
  ensureWorkdir(workdir);
  const opencodeDir = path.join(workdir, ".opencode");
  if (existsSync(opencodeDir)) {
    return { workdir, seeded: false };
  }
  cpSync(scaffoldDir, workdir, { recursive: true });
  return { workdir, seeded: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- src/main/ensure-harness.test.ts`
Expected: PASS (all 6 tests; the symlink test may silently skip on hosts that disallow symlink creation).

---

## Task 4: `harness-file.ts` — the security boundary

**Files:**
- Create: `src/main/harness-file.ts`
- Create: `src/main/harness-file.test.ts`

Implements `safeResolve(workdir, relPath)` verbatim from the spec, plus `assertSessionsWorkdir(userData, workdir)`, `safeRead`, `safeWrite`. Every IPC read/write routes through `safeResolve`.

- [ ] **Step 1: Write the failing test**

Create `src/main/harness-file.test.ts`:

```ts
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSessionsWorkdir, safeRead, safeResolve, safeWrite } from "./harness-file";

let root: string;
let workdir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "harness-root-"));
  mkdirSync(path.join(root, "opencode-sessions"), { recursive: true });
  workdir = mkdirSync(path.join(root, "opencode-sessions", "cluster-1"), { recursive: true }) ?? path.join(root, "opencode-sessions", "cluster-1");
  // mkdirSync with recursive returns the first dir created; if it already
  // existed it returns undefined — normalize to the target path.
  workdir = path.join(root, "opencode-sessions", "cluster-1");
  // ensure it actually exists (realpathSync below requires it)
  mkdirSync(workdir, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("safeResolve", () => {
  it("allows a relative path inside the workdir", () => {
    const resolved = safeResolve(workdir, "AGENTS.md");
    expect(resolved).toBe(path.join(workdir, "AGENTS.md"));
  });

  it("normalizes forward-slash relative paths", () => {
    mkdirSync(path.join(workdir, "sub"), { recursive: true });
    const resolved = safeResolve(workdir, "sub/file.txt");
    expect(resolved).toBe(path.join(workdir, "sub", "file.txt"));
  });

  it("throws on `..` escape", () => {
    expect(() => safeResolve(workdir, path.join("..", "..", "etc", "passwd"))).toThrow(/Forbidden path/);
  });

  it("throws on an absolute relPath", () => {
    const abs = path.resolve(path.sep, "abs", "target");
    expect(() => safeResolve(workdir, abs)).toThrow(/Forbidden path/);
  });

  it("throws on a NUL byte", () => {
    expect(() => safeResolve(workdir, "foo\0bar")).toThrow(/Forbidden path/);
  });

  it.runIf(process.platform === "win32")("throws on Windows backslash `..` escape", () => {
    expect(() => safeResolve(workdir, "..\\..\\Windows\\System32")).toThrow(/Forbidden path/);
  });
});

describe("assertSessionsWorkdir", () => {
  it("returns the realpath when workdir is inside <userData>/opencode-sessions/", () => {
    const real = assertSessionsWorkdir(root, workdir);
    expect(realpathSync(workdir)).toBe(real);
  });

  it("throws when workdir is outside the sessions root", () => {
    const outside = mkdtempSync(path.join(tmpdir(), "outside-"));
    try {
      expect(() => assertSessionsWorkdir(root, outside)).toThrow(/Forbidden workdir/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("safeRead", () => {
  it("returns {content, exists:true} for an existing file", () => {
    writeFileSync(path.join(workdir, "AGENTS.md"), "hello", "utf8");
    const result = safeRead(workdir, "AGENTS.md");
    expect(result).toEqual({ content: "hello", exists: true });
  });

  it("returns {content:'', exists:false} for a missing file (no throw)", () => {
    const result = safeRead(workdir, "nope.md");
    expect(result).toEqual({ content: "", exists: false });
  });
});

describe("safeWrite", () => {
  it("writes content to an existing file", () => {
    safeWrite(workdir, "AGENTS.md", "bye");
    expect(JSON.parse(JSON.stringify({ c: require("node:fs").readFileSync(path.join(workdir, "AGENTS.md"), "utf8") }))).toEqual({ c: "bye" });
  });

  it("creates parent dirs for a new nested file", () => {
    safeWrite(workdir, path.join("notes", "a.txt"), "n");
    expect(require("node:fs").readFileSync(path.join(workdir, "notes", "a.txt"), "utf8")).toBe("n");
  });

  it("refuses to write outside the workdir", () => {
    expect(() => safeWrite(workdir, path.join("..", "escape.txt"), "x")).toThrow(/Forbidden path/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- src/main/harness-file.test.ts`
Expected: FAIL with `safeResolve is not exported`.

- [ ] **Step 3: Write the implementation**

Create `src/main/harness-file.ts`:

```ts
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

// Security choke point — every read/write in this module routes through here.
// Anchors against realpathSync(workdir) so symlinks pointing outside are
// caught at the anchor, normalizes forward-slash relPaths from the renderer,
// rejects absolute relPaths and NUL bytes. Case-insensitive drive-letter
// compare for Windows correctness.
export function safeResolve(workdir: string, relPath: string): string {
  if (path.isAbsolute(relPath) || relPath.includes("\0")) throw new Error("Forbidden path");
  const normalizedRel = relPath.replace(/\//g, path.sep);
  if (path.isAbsolute(normalizedRel)) throw new Error("Forbidden path");
  const realWorkdir = realpathSync(workdir);
  const resolved = path.resolve(realWorkdir, normalizedRel);
  const sep = path.sep;
  const inside =
    resolved.toLowerCase() === realWorkdir.toLowerCase() ||
    resolved.toLowerCase().startsWith(realWorkdir.toLowerCase() + sep.toLowerCase());
  if (!inside) throw new Error("Forbidden path");
  return resolved;
}

// Validates that a renderer-supplied workdir is actually under
// <userData>/opencode-sessions/. Used by the read/write IPC handlers so a
// compromised renderer cannot read/write arbitrary paths.
export function assertSessionsWorkdir(userData: string, workdir: string): string {
  const realUd = realpathSync(userData);
  const sessionsRoot = path.join(realUd, "opencode-sessions");
  const realWd = realpathSync(workdir);
  const sep = path.sep;
  const inside =
    realWd.toLowerCase() === sessionsRoot.toLowerCase() ||
    realWd.toLowerCase().startsWith(sessionsRoot.toLowerCase() + sep.toLowerCase());
  if (!inside) throw new Error("Forbidden workdir");
  return realWd;
}

export interface SafeReadResult {
  content: string;
  exists: boolean;
}

export function safeRead(workdir: string, relPath: string): SafeReadResult {
  const abs = safeResolve(workdir, relPath);
  try {
    return { content: readFileSync(abs, "utf8"), exists: true };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { content: "", exists: false };
    throw err;
  }
}

export interface SafeWriteResult {
  ok: true;
  bytes: number;
}

export function safeWrite(workdir: string, relPath: string, content: string): SafeWriteResult {
  const abs = safeResolve(workdir, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
  return { ok: true, bytes: Buffer.byteLength(content, "utf8") };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- src/main/harness-file.test.ts`
Expected: PASS (all tests; the Windows-only test skips on POSIX).


---

## Task 5: `reveal-path.ts` — open workdir in OS file manager

**Files:**
- Create: `src/main/reveal-path.ts`

Thin wrapper over Electron `shell.openPath`. Validates the absolute path is inside `<userData>/opencode-sessions/` before delegating. No unit test — `shell.openPath` is an Electron API; smoke-only per the spec.

- [ ] **Step 1: Write the implementation**

Create `src/main/reveal-path.ts`:

```ts
import { realpathSync } from "node:fs";
import path from "node:path";
import { shell } from "electron";

// Validates absPath is inside <userData>/opencode-sessions/, then delegates to
// shell.openPath. openPath returns "" on success, an error string otherwise.
export async function revealPath(
  userData: string,
  absPath: string,
  openPath: (p: string) => Promise<string> = shell.openPath,
): Promise<{ ok: boolean; error?: string }> {
  const realUd = realpathSync(userData);
  const sessionsRoot = path.join(realUd, "opencode-sessions");
  let realAbs: string;
  try {
    realAbs = realpathSync(absPath);
  } catch (err: any) {
    if (err?.code === "ENOENT") return { ok: false, error: "Path does not exist" };
    throw err;
  }
  const sep = path.sep;
  const inside =
    realAbs.toLowerCase() === sessionsRoot.toLowerCase() ||
    realAbs.toLowerCase().startsWith(sessionsRoot.toLowerCase() + sep.toLowerCase());
  if (!inside) return { ok: false, error: "Forbidden path" };
  const result = await openPath(realAbs);
  return result === "" ? { ok: true } : { ok: false, error: result };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm type:check`
Expected: PASS.


---

## Task 6: Wire IPC handlers in `src/main/index.ts`

**Files:**
- Modify: `src/main/index.ts`

Replaces the `get-agent-workdir` handler with four new handlers. `get-agent-workdir` is dropped because `prepare-harness` returns the workdir (review gate from the spec: the new page no longer calls `get-agent-workdir`, so we drop it). The `get-agent-workdir.ts` module stays — `computeWorkdir`/`ensureWorkdir` are reused by `ensureHarness`. The `get-agent-workdir.test.ts` stays (still covers the pure module).

- [ ] **Step 1: Replace `src/main/index.ts`**

Overwrite the file with:

```ts
import { Main } from "@freelensapp/extensions";
import { app, ipcMain } from "electron";
import { checkOpencodeInstalled } from "./check-opencode-installed";
import { computeWorkdir } from "./get-agent-workdir";
import { ensureHarness } from "./ensure-harness";
import { assertSessionsWorkdir, safeRead, safeWrite } from "./harness-file";
import { revealPath } from "./reveal-path";

// ponytail: extension uses raw electron ipcMain directly instead of the
// Main.Ipc abstraction exported by @freelensapp/extensions. Reason: Main.Ipc
// is published as the ABSTRACT CLASS IpcMain (not an instance); its `handle`
// method is an instance method, so Main.Ipc.handle(...) does not typecheck
// against @freelensapp/extensions@1.10.2's declarations. Raw ipcMain +
// hardcoded channel prefix is the minimal working interface. Upgrade path: if
// a future Freelens release exposes a concrete per-extension IpcMain instance
// (e.g. `Main.Ipc.getInstance(...).handle(...)`), switch back to get the
// auto-prefixed channel + auto-cleanup disposers. Channel prefix below is
// unique enough to avoid collisions with other extensions.
const CHANNEL_PREFIX = "opencode-extension:";

export default class OpencodeMainExtension extends Main.LensExtension {
  async onActivate() {
    ipcMain.handle(`${CHANNEL_PREFIX}check-opencode-installed`, async () => {
      try {
        return await checkOpencodeInstalled();
      } catch (err: any) {
        return { installed: false, error: err?.message ?? String(err) };
      }
    });

    // Returns { workdir, seeded }. Computes workdir, mkdir -p, seeds scaffold
    // from out/main/scaffold/ on first open. Replaces get-agent-workdir: it
    // returns the workdir too, so the renderer needs only this handler.
    ipcMain.handle(`${CHANNEL_PREFIX}prepare-harness`, async (_event, clusterId: string) => {
      try {
        const workdir = computeWorkdir(app.getPath("userData"), clusterId);
        return ensureHarness(workdir);
      } catch (err: any) {
        throw new Error(`Could not prepare harness: ${err?.message ?? err}`);
      }
    });

    ipcMain.handle(`${CHANNEL_PREFIX}read-harness-file`, async (_event, workdir: string, relPath: string) => {
      try {
        const realWd = assertSessionsWorkdir(app.getPath("userData"), workdir);
        return safeRead(realWd, relPath);
      } catch (err: any) {
        throw new Error(`Could not read harness file: ${err?.message ?? err}`);
      }
    });

    ipcMain.handle(`${CHANNEL_PREFIX}write-harness-file`, async (_event, workdir: string, relPath: string, content: string) => {
      try {
        const realWd = assertSessionsWorkdir(app.getPath("userData"), workdir);
        return safeWrite(realWd, relPath, content);
      } catch (err: any) {
        throw new Error(`Could not write harness file: ${err?.message ?? err}`);
      }
    });

    ipcMain.handle(`${CHANNEL_PREFIX}reveal-path`, async (_event, absPath: string) => {
      return revealPath(app.getPath("userData"), absPath);
    });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm type:check`
Expected: PASS.

- [ ] **Step 3: Verify unit tests still pass**

Run: `pnpm test:unit`
Expected: PASS (existing `get-agent-workdir.test.ts` still passes — the module is intact; only the IPC handler was removed).


---

## Task 7: Add runtime deps to `package.json`

**Files:**
- Modify: `package.json`

The extension's first runtime dependencies. Existing `package.json` has only `devDependencies`; add a `dependencies` block. Pin versions consistent with the existing React 17 / Vite 8 stack.

- [ ] **Step 1: Add the `dependencies` block**

Insert into `package.json` after the `"engines"` block (or anywhere top-level — key order is cosmetic), a new `dependencies` section:

```json
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "monaco-editor": "^0.52.2"
  },
```

Also update the `"files"` block — it already ships `out/**/*`, which is sufficient (the bundled Monaco workers land under `out/renderer/`).

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: `monaco-editor` and `@monaco-editor/react` resolve into `node_modules`; lockfile updated.

- [ ] **Step 3: Typecheck**

Run: `pnpm type:check`
Expected: PASS.


---

## Task 8: `electron.vite.config.js` — Monaco workers + scaffold copy

**Files:**
- Modify: `electron.vite.config.js`

Three concerns: (a) bundle Monaco editor workers into `out/renderer/` via Vite `?worker` imports; (b) add `optimizeDeps`/`assetsInclude` so the renderer pipeline handles `monaco-editor` ESM correctly; (c) copy `src/main/scaffold/` to `out/main/scaffold/` at build end so `resolveScaffoldDir()` finds it in production.

The `?worker` import is done in `agents-md-editor.tsx` (Task 9), not here. Here we only ensure the renderer config isn't broken by Monaco. Under Vite 8 + Rolldown, `?worker` works out of the box; no special config is needed unless the build fails, so we keep changes minimal.

- [ ] **Step 1: Add the scaffold-copy plugin**

Replace `electron.vite.config.js` with:

```js
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { cpSync, rmSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { globalExternals } from "./build/global-externals.js";

const runtimeExternals = ["electron", /^electron\//, ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

// Copies the bundled k8s-aware scaffold (opencode.json + AGENTS.md) from
// src/main/scaffold/ to out/main/scaffold/ at the end of the main build, so
// resolveScaffoldDir() finds the bundled copy in production. Runs at
// closeBundle so it lands after rolldown writes out/main/index.js.
function copyScaffold() {
  return {
    name: "copy-scaffold",
    apply: "build",
    closeBundle() {
      const src = resolve(process.cwd(), "src", "main", "scaffold");
      const dest = resolve(process.cwd(), "out", "main", "scaffold");
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, "src/main/index.ts"), formats: ["cjs"] },
      rolldownOptions: {
        external: runtimeExternals,
        output: {
          exports: "named",
          preserveModules: (process.env.VITE_PRESERVE_MODULES ?? "true") === "true",
          preserveModulesRoot: "src/main",
        },
      },
      sourcemap: true,
    },
    oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
    plugins: [
      react({
        babel: { plugins: [["@babel/plugin-proposal-decorators", { version: "2023-05" }]] },
      }),
      globalExternals({
        "@freelensapp/extensions": "global.LensExtensions",
        mobx: "global.Mobx",
      }),
      copyScaffold(),
    ],
  },
  preload: {
    build: {
      lib: { entry: resolve(__dirname, "src/renderer/index.tsx"), formats: ["cjs"] },
      outDir: "out/renderer",
      rolldownOptions: {
        external: runtimeExternals,
        output: {
          exports: "named",
          preserveModules: (process.env.VITE_PRESERVE_MODULES ?? "true") === "true",
          preserveModulesRoot: "src/renderer",
        },
      },
      sourcemap: true,
    },
    css: { modules: { localsConvention: "camelCaseOnly" } },
    oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
    // monaco-editor ships ESM workers that Vite's ?worker handles natively.
    // rollupOptions.input is not needed; the renderer graph pulls workers via
    // `?worker` imports in agents-md-editor.tsx. optimizeDeps kept permissive
    // so Vite pre-bundles monaco-editor's ESM correctly under dev.
    optimizeDeps: {
      include: ["monaco-editor/esm/vs/editor/editor.worker", "monaco-editor"],
    },
    plugins: [
      react({
        babel: { plugins: [["@babel/plugin-proposal-decorators", { version: "2023-05" }]] },
      }),
      globalExternals({
        "@freelensapp/extensions": "global.LensExtensions",
        mobx: "global.Mobx",
        "mobx-react": "global.MobxReact",
        react: "global.React",
        "react-dom": "global.ReactDom",
        "react-router-dom": "global.ReactRouterDom",
        "react/jsx-runtime": "global.ReactJsxRuntime",
      }),
    ],
  },
});
```

- [ ] **Step 2: Verify build produces the scaffold copy (after Task 9 imports Monaco, or with a stub)**

A build before `agents-md-editor.tsx` exists will not exercise Monaco, but it must still produce `out/main/scaffold/`. Run:

Run: `pnpm build`
Expected: `out/main/scaffold/.opencode/opencode.json` and `out/main/scaffold/AGENTS.md` exist; build exits 0.

Verify:

```powershell
Test-Path "out/main/scaffold/.opencode/opencode.json"
Test-Path "out/main/scaffold/AGENTS.md"
```

Both `True`.

If the build fails here (before Task 9), the Monaco worker / optimizeDeps config is the likely culprit — comment out the `optimizeDeps.include` line for now and restore it in Task 9. Re-run build; ensure it passes.


---

## Task 9: `agents-md-editor.tsx` — Monaco wrapper

**Files:**
- Create: `src/renderer/agents-md-editor.tsx`

Loads `AGENTS.md` via `read-harness-file`, edits in Monaco (markdown mode), debounced 500ms autosave via `write-harness-file`. Status badge: Saved / Saving… / Save failed. On write failure, in-memory content is preserved (no clear).

Uses `@monaco-editor/react` with `loader.config({ monaco })` pointed at the local `monaco-editor` namespace (offline — no CDN). Bundles the editor worker via `?worker` import.

- [ ] **Step 1: Write the component**

Create `src/renderer/agents-md-editor.tsx`:

```tsx
import { Monaco } from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";
import * as monacoEditor from "monaco-editor";
import { ipcRenderer } from "electron";
import { useEffect, useRef, useState } from "react";

// ponytail: Monaco bundling. Offline config — use the local `monaco-editor`
// npm package, never the CDN. loader.config must run before any Editor
// mounts; doing it at module-eval time is the documented pattern.
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

// self.MonacoEnvironment worker factory — required for Monaco to find the
// bundled worker. Assigned once at module eval.
(self as any).MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

loader.config({ monaco: monacoEditor as any });

const CHANNEL_PREFIX = "opencode-extension:";
const SAVE_DEBOUNCE_MS = 500;

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface AgentsMdEditorProps {
  workdir: string;
}

export function AgentsMdEditor({ workdir }: AgentsMdEditorProps) {
  const [content, setContent] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  // Track the content that is currently committed to disk, so we don't write
  // when the editor load itself equalled the on-disk content.
  const committedRef = useRef<string>("");

  // Load AGENTS.md once per workdir.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setStatus("idle");
    setError(undefined);
    (async () => {
      try {
        const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}read-harness-file`, workdir, "AGENTS.md")) as {
          content: string;
          exists: boolean;
        };
        if (cancelled) return;
        setContent(result.content);
        committedRef.current = result.content;
        setLoaded(true);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? String(err));
        setStatus("error");
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [workdir]);

  function onChange(value: string | undefined) {
    const next = value ?? "";
    setContent(next);
    setStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await ipcRenderer.invoke(`${CHANNEL_PREFIX}write-harness-file`, workdir, "AGENTS.md", next);
        committedRef.current = next;
        setStatus("saved");
        setError(undefined);
        // ponytail: clear "Saved" badge back to idle after 1s so the badge
        // doesn't look stuck on a transient state.
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1000);
      } catch (err: any) {
        setStatus("error");
        setError(err?.message ?? String(err));
      }
    }, SAVE_DEBOUNCE_MS);
  }

  const badge = (() => {
    if (status === "saving") return { text: "Saving…", color: "#b80" };
    if (status === "saved") return { text: "Saved", color: "#080" };
    if (status === "error") return { text: `Save failed: ${error ?? "unknown"}`, color: "#c00" };
    return { text: "", color: "#888" };
  })();

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
        <strong>AGENTS.md</strong>
        {badge.text && <span style={{ color: badge.color, fontSize: "0.85em" }}>{badge.text}</span>}
      </div>
      <div style={{ border: "1px solid #ccc", height: "360px" }}>
        {loaded ? (
          <Monaco
            language="markdown"
            value={content}
            onChange={(v) => onChange(v)}
            options={{
              wordWrap: "on",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
            loading={<p style={{ padding: "0.5rem" }}>Loading editor…</p>}
          />
        ) : (
          <p style={{ padding: "0.5rem" }}>Loading AGENTS.md…</p>
        )}
      </div>
      {/* ponytail: no test for this component — Monaco + electron ipcRenderer
          are host concerns; the page is smoke-tested manually. */}
    </div>
  );
}
```

- [ ] **Step 2: Verify the build bundles Monaco workers**

Run: `pnpm build`
Expected: exits 0. Verify worker file under `out/renderer/`:

```powershell
Get-ChildItem -Path out/renderer -Recurse -Filter "*.worker.js" | Select-Object -ExpandProperty FullName
```

If empty: the `?worker` import was externalized. Check the `optimizeDeps.include` from Task 8 is intact; if the build surface a mismatch, ensure `monaco-editor` is not in `runtimeExternals` (it must NOT be — only host-provided globals are).

- [ ] **Step 3: Typecheck**

Run: `pnpm type:check`
Expected: PASS. If `?worker` import lacks types, add to `src/renderer/vite-env.d.ts` (creating it) the reference:

```ts
/// <reference types="vite/client" />
```

(`tsconfig.json` already has `"types": ["vite/client"]` so `?worker` import types should be recognized.)


---

## Task 10: Update `agent-session-page.tsx`

**Files:**
- Modify: `src/renderer/agent-session-page.tsx`

Replaces the `get-agent-workdir` invoke with `prepare-harness`, adds the Reveal button + Monaco editor + reset footer. Existing status card (opencode detected, version, Open agent session button) stays.

- [ ] **Step 1: Replace the page**

Overwrite `src/renderer/agent-session-page.tsx` with:

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

interface AgentSessionPageProps {
  extension: Renderer.LensExtension;
}

export const AgentSessionPage = observer(function AgentSessionPage({ extension: _extension }: AgentSessionPageProps) {
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
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reveal-path`, state.workdir)) as {
      ok: boolean;
      error?: string;
    };
    if (!result.ok) {
      // ponytail: surface the failure inline — no separate toast infra in this extension.
      setState((s) => ({ ...s, error: `Reveal failed: ${result.error ?? "unknown"}` }));
    }
  }

  function copyResetPath() {
    if (!state.workdir) return;
    // ponytail: clipboard via navigator (renderer process has it in Electron).
    navigator.clipboard?.writeText(state.workdir);
  }

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h2>Agent Session</h2>

      {state.status === "loading" && <p>Checking for opencode…</p>}

      {state.status === "missing" && (
        <div style={{ border: "1px solid #c00", padding: "0.75rem", color: "#c00" }}>
          <p>
            opencode not found on PATH. Install:{" "}
            <a href="https://opencode.ai/docs/" target="_blank" rel="noreferrer">
              https://opencode.ai/docs/
            </a>
          </p>
          {state.error && <p style={{ fontSize: "0.85em" }}>Detail: {state.error}</p>}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}

      {state.status === "error" && (
        <div style={{ border: "1px solid #c00", padding: "0.75rem", color: "#c00" }}>
          {state.error}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}

      {state.status === "ready" && state.workdir && (
        <div style={{ border: "1px solid #080", padding: "0.75rem", color: "#080" }}>
          <p>opencode detected (v{state.version}).</p>
          <p>
            Working directory: <code>{state.workdir}</code>
          </p>
          <button onClick={launch} disabled={!clusterId}>
            Open agent session
          </button>
          <div style={{ marginTop: "0.5rem" }}>
            <button onClick={() => void reveal()}>Reveal workdir</button>
          </div>
          <AgentsMdEditor workdir={state.workdir} />
          <p style={{ marginTop: "0.5rem", color: "#888", fontSize: "0.85em", cursor: "pointer" }} onClick={copyResetPath}>
            Reset: delete .opencode/ then reopen (click copies workdir path)
          </p>
        </div>
      )}

      {/* ponytail: no test for this page — it's a thin shell over public APIs
          (createTerminalTab + sendCommand + ipcRenderer.invoke + Monaco). Manual smoke only. */}
    </div>
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm type:check`
Expected: PASS. If `navigator.clipboard` is not typed, ensure `@types/react` or lib DOM is present; `tsconfig` inherits DOM via `@electron-toolkit/tsconfig`. If still missing, cast: `(navigator as any).clipboard?.writeText(...)`.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: exits 0; `out/main/index.js`, `out/main/scaffold/...`, `out/renderer/index.js`, and a Monaco worker under `out/renderer/` all produced.


---

## Task 11: Update README + architecture skill

**Files:**
- Modify: `README.md`
- Modify: `.opencode/skills/freelens-opencode-extension-architecture/SKILL.md`

Documents the harness, the first runtime deps, the seed-on-missing policy, and the reset path.

- [ ] **Step 1: Update README**

In `README.md`, replace the bullet about "No `opencode.json` permission rules…" (currently under Features) with a new Features bullet set describing the harness, and add a Harness section after Architecture. Replace this bullet:

```
- No `opencode.json` permission rules — the agent runs full opencode. To
  restrict later, drop a config file into the per-cluster workdir.
```

with:

```markdown
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
```

Add a new "## Harness" section after the Architecture section:

```markdown
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
```

Also update the Architecture section's last line ("No runtime deps in `package.json`.") to:

```markdown
Runtime globals (`@freelensapp/extensions`, `mobx`, `react`, ...) injected by
the Freelens host. Monaco is the exception — `monaco-editor` and
`@monaco-editor/react` are the extension's first runtime dependencies
(bundled into `out/renderer/` at build, shipped in the `.tgz`).
```

- [ ] **Step 2: Update the architecture skill**

In `.opencode/skills/freelens-opencode-extension-architecture/SKILL.md`, append:

```markdown

## Per-cluster harness (phase 1)

Every cluster session gets a persistent `.opencode/` tree under
`<userData>/opencode-sessions/<safe-id>/`, seeded from a bundled k8s-aware
scaffold on first open (`ensure-harness.ts`). Main registers four IPC
handlers (`prepare-harness`, `read-harness-file`, `write-harness-file`,
`reveal-path`) — all on the `opencode-extension:` prefix. Every read/write
routes through `safeResolve(workdir, relPath)` in `harness-file.ts`, which
anchors against `realpathSync(workdir)` to prevent path escape. The old
`get-agent-workdir` IPC handler was dropped (`prepare-harness` returns the
workdir); the `computeWorkdir`/`ensureWorkdir` pure module remains in use.
The renderer page (`agent-session-page.tsx`) calls `prepare-harness` once on
load and renders a Monaco-based `AGENTS.md` editor with debounced autosave
plus a Reveal workdir button. `monaco-editor` + `@monaco-editor/react` are
the extension's first runtime deps; bundled under `out/renderer/` via Vite
`?worker` imports, offline (`loader.config({ monaco })`).
```


---

## Task 12: Build, pack, verify

**Files:** (none — verification only)

Per the project's `AGENTS.md` rule: at the end of each implementation session, build and pack the extension.

- [ ] **Step 1: Lint**

Run: `pnpm lint:check`
Expected: PASS. If violations, run `pnpm lint:fix` and re-check.

- [ ] **Step 2: Type**

Run: `pnpm type:check`
Expected: PASS.

- [ ] **Step 3: Unit tests**

Run: `pnpm test:unit`
Expected: PASS — all existing specs (`check-opencode-installed.test.ts`, `get-agent-workdir.test.ts`, `get-launch-command.test.ts`) plus new (`scaffold-source`, `ensure-harness`, `harness-file`).

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: exits 0. Verify outputs:

```powershell
Test-Path "out/main/index.js"
Test-Path "out/main/scaffold/.opencode/opencode.json"
Test-Path "out/main/scaffold/AGENTS.md"
Test-Path "out/renderer/index.js"
Get-ChildItem -Path out/renderer -Recurse -Filter "*.worker.js" | Select-Object -ExpandProperty FullName
```

All `True`; the worker glob returns at least one file.

- [ ] **Step 5: Pack**

Run: `pnpm pack`
Expected: produces `freelensapp-opencode-extension-0.1.0.tgz`. Confirm pack size grew by ~1–2MB (Monaco) — expected.

- [ ] **Step 6: Manual smoke (optional, outside plan execution)**

Install the `.tgz` into a running Freelens, open a cluster's Agent Session page:
- First open: AGENTS.md editor loads with seeded k8s-aware content; Reveal button opens the workdir in the OS file manager.
- Edit AGENTS.md → badge shows Saving… → Saved.
- Close and reopen the page → edits persist; `prepare-harness` returns `seeded:false` (no visible change, content intact).
- Delete `.opencode/`, page rewrites seeded scaffold on next open.

---

## Risk register (from the spec — restated for execution)

- **Monaco bundling under electron-vite + Electron renderer.** `?worker` is well-trodden but unexercised here. If the renderer build can't bundle `monaco-editor`, fall back to a `<textarea>` + the same debounced autosave; do NOT block the harness on Monaco. The fallback is a 1-component swap (`agents-md-editor.tsx` body) — Task 8/9 are the only impacted steps.
- **`shell.openPath` on Windows.** If it regresses, swap to `shell.showItemInFolder(workdir)` inside `reveal-path.ts` (selects the folder in Explorer).
- **`fs.cpSync` recursive copy + all fs APIs used.** Stable on Node ≥22. No risk.
- **Pack size +1–2MB.** Acceptable for phase 1. If users complain, move Monaco to a dynamic import loaded only when the editor mounts (defer to a future phase).

---

## Self-review

**Spec coverage:**
- Full `.opencode/` tree + bundled scaffold + seed-on-missing → Tasks 1, 2, 3, 6, 8.
- 4 IPC handlers (prepare-harness, read-harness-file, write-harness-file, reveal-path) → Task 6.
- `safeResolve` security boundary → Task 4.
- Existing handlers unchanged / `get-agent-workdir` dropped (review gate) → Task 6.
- Renderer page: status card + Reveal + Monaco AGENTS.md editor + debounced autosave → Tasks 9, 10.
- Monaco loading fully offline → Tasks 7, 8, 9.
- Files (new/changed) list → matches all tasks above.
- Testing (`ensure-harness.test.ts`, `harness-file.test.ts`, no `reveal-path.test.ts`, no renderer test) → Tasks 3, 4, 5.
- Build & end-of-session build+pack → Task 12.
- README + first runtime dep documentation → Task 11.
- Out-of-scope items (opencode.json editor, skill browser, migration, reset button) → not touched. ✓

**Placeholder scan:** No TBD/TODO/"implement later". Every step has the full code or exact command.

**Type consistency:** `PrepareHarnessResult { workdir, seeded }` — used in Task 3, 6, 10. `SafeReadResult { content, exists }` — Task 4, 6, 9. `SafeWriteResult { ok, bytes }` — Task 4, 6. `safeResolve(workdir, relPath)` signature — Task 4, 6. `revealPath(userData, absPath, openPath?)` — Task 5, 6. `resolveScaffoldDir(explicit?)` — Task 2, 3. Channel names match across main (Task 6) and renderer (Tasks 9, 10): `opencode-extension:prepare-harness`, `:read-harness-file`, `:write-harness-file`, `:reveal-path`. ✓