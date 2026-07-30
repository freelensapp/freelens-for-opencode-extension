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
