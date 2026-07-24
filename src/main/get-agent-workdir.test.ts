import { mkdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { computeWorkdir, ensureWorkdir } from "./get-agent-workdir";

vi.mock("node:fs", () => ({ mkdirSync: vi.fn() }));

describe("computeWorkdir", () => {
  it("joins userData/opencode-sessions/<sanitized-id>/", () => {
    expect(computeWorkdir("/tmp/userdata", "cluster-1")).toBe("/tmp/userdata/opencode-sessions/cluster-1/");
  });

  it("replaces every non-[a-zA-Z0-9-_] char with underscore", () => {
    expect(computeWorkdir("/tmp", "a/b:c d")).toBe("/tmp/opencode-sessions/a_b_c_d/");
  });

  it("preserves already-safe ids unchanged", () => {
    expect(computeWorkdir("/tmp", "my-cluster_01")).toBe("/tmp/opencode-sessions/my-cluster_01/");
  });
});

describe("ensureWorkdir", () => {
  it("creates the dir recursively and returns the path", () => {
    const mkdir = vi.mocked(mkdirSync);
    mkdir.mockImplementation(() => undefined as any);

    const result = ensureWorkdir("/tmp/userdata/opencode-sessions/cluster-1/");

    expect(result).toBe("/tmp/userdata/opencode-sessions/cluster-1/");
    expect(mkdir).toHaveBeenCalledWith("/tmp/userdata/opencode-sessions/cluster-1/", {
      recursive: true,
    });
    mkdir.mockReset();
  });

  it("propagates mkdir failures", () => {
    const mkdir = vi.mocked(mkdirSync);
    mkdir.mockImplementation(() => {
      throw new Error("EACCES");
    });

    expect(() => ensureWorkdir("/nope/")).toThrow("EACCES");
    mkdir.mockReset();
  });
});
