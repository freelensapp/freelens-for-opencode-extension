import { mkdirSync } from "node:fs";

const SANITIZE = /[^a-zA-Z0-9-_]/g;

export function computeWorkdir(userData: string, clusterId: string): string {
  const safe = clusterId.replace(SANITIZE, "_");
  return `${userData}/opencode-sessions/${safe}/`;
}

export function ensureWorkdir(workdir: string): string {
  mkdirSync(workdir, { recursive: true });
  return workdir;
}
