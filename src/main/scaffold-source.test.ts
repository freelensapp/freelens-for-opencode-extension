import { existsSync, readFileSync } from "node:fs";
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

  it("seeds valid permission.bash defaults that gate destructive commands with ask", () => {
    const jsonPath = path.join(resolveScaffoldDir(), ".opencode", "opencode.json");
    const config = JSON.parse(readFileSync(jsonPath, "utf8"));
    const bash = config.permission?.bash;
    expect(bash["*"]).toBe("allow");
    for (const pattern of ["kubectl delete *", "kubectl drain *", "helm uninstall *", "helm delete *"]) {
      expect(bash[pattern]).toBe("ask");
    }
  });
});
