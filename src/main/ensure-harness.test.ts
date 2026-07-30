import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureHarness, resetHarness } from "./ensure-harness";

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
          require("node:fs").symlinkSync(
            path.join(outside, "sensitive"),
            link,
            process.platform === "win32" ? "junction" : "dir",
          );
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
