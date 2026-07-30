import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { ensureWorkdir } from "./get-agent-workdir";
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
  ensureWorkdir(workdir);
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

// resetHarness deletes only .opencode/ (the scaffolded config dir). The user's
// root AGENTS.md is preserved; a subsequent prepare-harness re-seeds .opencode/
// without clobbering it (see ensureHarness no-clobber branch).
export function resetHarness(workdir: string): void {
  const target = path.join(workdir, ".opencode");
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
