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
