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
