import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { computeProviderWorkdir } from "./get-provider-workdir";
import { resolveScaffoldDir } from "./scaffold-source";

export interface PrepareHarnessResult {
  workdir: string;
  seeded: boolean;
}

// ponytail: scaffold layout mirrors the harness layout (.opencode/opencode.json
// + AGENTS.md at root) so seeding copies the scaffold into the workdir.
// ensureHarness is per-file no-clobber: a target entry that already exists
// (e.g. a user-edited AGENTS.md left behind by resetHarness) is skipped on
// re-seed. The fast path (.opencode/ present → seeded:false) stays.
export function ensureHarness(workdir: string, scaffoldDir: string = resolveScaffoldDir()): PrepareHarnessResult {
  mkdirSync(workdir, { recursive: true });
  const opencodeDir = path.join(workdir, ".opencode");
  if (existsSync(opencodeDir)) {
    return { workdir, seeded: false };
  }
  let seeded = false;
  for (const entry of readdirSync(scaffoldDir)) {
    const src = path.join(scaffoldDir, entry);
    const dst = path.join(workdir, entry);
    if (existsSync(dst)) continue;
    const stat = statSync(src);
    if (stat.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      cpSync(src, dst, { recursive: true });
    } else {
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
    seeded = true;
  }
  return { workdir, seeded };
}

export function prepareOpenCodeHarness(
  userData: string,
  clusterId: string,
  scaffoldDir: string = resolveScaffoldDir(),
): PrepareHarnessResult {
  const workdir = computeProviderWorkdir(userData, clusterId, "opencode");
  // Legacy workdirs sanitized IDs without a digest.
  const legacyWorkdir = path.join(userData, "opencode-sessions", clusterId.replace(/[^a-zA-Z0-9-_]/g, "_"));

  if (existsSync(legacyWorkdir) && !existsSync(workdir)) {
    mkdirSync(path.dirname(workdir), { recursive: true });
    renameSync(legacyWorkdir, workdir);
  }

  return ensureHarness(workdir, scaffoldDir);
}

// resetHarness deletes only .opencode/ (the scaffolded config dir). The user's
// root AGENTS.md is preserved; a subsequent prepare-harness re-seeds .opencode/
// without clobbering it (see ensureHarness no-clobber branch).
export function resetHarness(workdir: string): void {
  const target = path.join(workdir, ".opencode");
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
