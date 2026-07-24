import { spawn as realSpawn } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";

export interface OpencodeCheckResult {
  installed: boolean;
  version?: string;
  error?: string;
}

type SpawnFn = typeof realSpawn;

const VERSION_RE = /\d+\.\d+\.\d+/;

export function checkOpencodeInstalled(spawn: SpawnFn = realSpawn): Promise<OpencodeCheckResult> {
  const shell = process.platform === "win32";
  const opts: SpawnOptions = { shell };

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn("opencode", ["--version"], opts);
    } catch (err: any) {
      resolve({ installed: false, error: err?.message ?? String(err) });
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err: any) => {
      const code = err?.code ?? "";
      resolve({
        installed: false,
        error: code ? `opencode not found on PATH (${code})` : "opencode not found on PATH",
      });
    });

    child.on("exit", (code: number | null) => {
      // ponytail: defer resolve one microtask so a competing `error` event
      // (fired later in the same event loop batch by some test fakes, and
      // before `exit` in real ENOENT cases) wins. Harmless in production —
      // adds one tick; exit handlers always run after stub registers.
      queueMicrotask(() => {
        if (code === 0) {
          const match = stdout.match(VERSION_RE);
          resolve({ installed: true, version: match ? match[0] : stdout.trim() || "unknown" });
        } else {
          resolve({
            installed: false,
            error: `opencode --version exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
          });
        }
      });
    });
  });
}
