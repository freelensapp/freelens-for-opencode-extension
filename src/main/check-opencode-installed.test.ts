import { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { checkOpencodeInstalled } from "./check-opencode-installed";

function makeFakeChild(stdout = "", stderr = "", exitCode: number | null = 0): ChildProcess {
  const ee = new EventEmitter() as ChildProcess;
  (ee as any).stdout = new EventEmitter();
  (ee as any).stderr = new EventEmitter();
  (ee as any).stdin = { end: vi.fn() };
  queueMicrotask(() => {
    (ee as any).stdout.emit("data", Buffer.from(stdout));
    (ee as any).stderr.emit("data", Buffer.from(stderr));
    ee.emit("exit", exitCode);
  });
  return ee;
}

describe("checkOpencodeInstalled", () => {
  it("returns {installed:true, version} on exit 0 with stdout", async () => {
    const fakeSpawn = vi.fn(() => makeFakeChild("opencode 1.2.3\n")) as any;
    const result = await checkOpencodeInstalled(fakeSpawn);
    expect(fakeSpawn).toHaveBeenCalledWith(
      "opencode",
      ["--version"],
      expect.objectContaining({ shell: expect.any(Boolean) }),
    );
    expect(result).toEqual({ installed: true, version: "1.2.3" });
  });

  it("returns {installed:false} on ENOENT", async () => {
    const fakeSpawn = vi.fn(() => {
      const ee = makeFakeChild();
      queueMicrotask(() => ee.emit("error", { code: "ENOENT" })); // ponytail: minimal error object, only `code` is read
      return ee;
    }) as any;
    const result = await checkOpencodeInstalled(fakeSpawn);
    expect(result.installed).toBe(false);
    expect(result.error).toMatch(/ENOENT|not found/i);
  });

  it("returns {installed:false} on non-zero exit", async () => {
    const fakeSpawn = vi.fn(() => makeFakeChild("", "broken install\n", 1)) as any;
    const result = await checkOpencodeInstalled(fakeSpawn);
    expect(result).toEqual({ installed: false, error: expect.any(String) });
  });

  it("parses version string tolerantly (first match of \\d+\\.\\d+\\.\\d+)", async () => {
    const fakeSpawn = vi.fn(() => makeFakeChild("opencode version 0.9.1-beta+abc\n")) as any;
    const result = await checkOpencodeInstalled(fakeSpawn);
    expect(result.version).toBe("0.9.1");
  });

  it("uses shell:true on win32, shell:false elsewhere", async () => {
    const fakeSpawn = vi.fn(() => makeFakeChild("opencode 1.0.0")) as any;
    const original = process.platform;
    for (const plat of ["win32", "linux"] as const) {
      Object.defineProperty(process, "platform", { value: plat, configurable: true });
      await checkOpencodeInstalled(fakeSpawn);
      const opts = fakeSpawn.mock.calls.at(-1)![2] as { shell: boolean };
      expect(opts.shell).toBe(plat === "win32");
    }
    Object.defineProperty(process, "platform", { value: original, configurable: true });
  });
});
