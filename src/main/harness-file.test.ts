import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertSessionsWorkdir, safeRead, safeResolve, safeWrite } from "./harness-file";

let root: string;
let workdir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "harness-root-"));
  mkdirSync(path.join(root, "ai-cli-sessions"), { recursive: true });
  workdir =
    mkdirSync(path.join(root, "ai-cli-sessions", "cluster-1"), { recursive: true }) ??
    path.join(root, "ai-cli-sessions", "cluster-1");
  // mkdirSync with recursive returns the first dir created; if it already
  // existed it returns undefined — normalize to the target path.
  workdir = path.join(root, "ai-cli-sessions", "cluster-1");
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
  it("returns the realpath when workdir is inside <userData>/ai-cli-sessions/", () => {
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
    expect(
      JSON.parse(JSON.stringify({ c: require("node:fs").readFileSync(path.join(workdir, "AGENTS.md"), "utf8") })),
    ).toEqual({ c: "bye" });
  });

  it("creates parent dirs for a new nested file", () => {
    safeWrite(workdir, path.join("notes", "a.txt"), "n");
    expect(require("node:fs").readFileSync(path.join(workdir, "notes", "a.txt"), "utf8")).toBe("n");
  });

  it("refuses to write outside the workdir", () => {
    expect(() => safeWrite(workdir, path.join("..", "escape.txt"), "x")).toThrow(/Forbidden path/);
  });
});
