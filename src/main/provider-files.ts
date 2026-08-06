import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { getAiCliProvider } from "../common/ai-cli-providers";
import { computeProviderWorkdir } from "./get-provider-workdir";
import { resolveProviderScaffold } from "./scaffold-source";

type OpenPath = (path: string) => Promise<string>;

function isInside(root: string, candidate: string): boolean {
  const normalize = (value: string) => (process.platform === "win32" ? value.toLowerCase() : value);
  const normalizedRoot = normalize(path.resolve(root));
  const normalizedCandidate = normalize(path.resolve(candidate));

  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function assertDeclaredPath(providerId: string, relPath: string): void {
  const provider = getAiCliProvider(providerId);
  const segments = relPath.split(/[\\/]+/);

  if (
    relPath.includes("\0") ||
    path.isAbsolute(relPath) ||
    path.win32.isAbsolute(relPath) ||
    segments.includes("..") ||
    !provider.editors.some((editor) => editor.path === relPath)
  ) {
    throw new Error("Forbidden path");
  }
}

function getWorkdir(userData: string, clusterId: string, providerId: string): string {
  const workdir = computeProviderWorkdir(userData, clusterId, providerId);
  mkdirSync(workdir, { recursive: true });

  return realpathSync(workdir);
}

function nearestExistingParent(target: string): string {
  let current = path.dirname(target);

  while (true) {
    try {
      lstatSync(current);
      return current;
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw new Error("Forbidden path");
      current = parent;
    }
  }
}

function resolveDeclaredFile(workdir: string, providerId: string, relPath: string): string {
  assertDeclaredPath(providerId, relPath);
  const realWorkdir = realpathSync(workdir);
  const target = path.resolve(realWorkdir, ...relPath.split(/[\\/]+/));

  if (!isInside(realWorkdir, target)) throw new Error("Forbidden path");

  let realParent: string;
  try {
    realParent = realpathSync(nearestExistingParent(target));
  } catch {
    throw new Error("Forbidden path");
  }
  if (!isInside(realWorkdir, realParent)) throw new Error("Forbidden path");

  if (existsSync(target)) {
    let realTarget: string;
    try {
      realTarget = realpathSync(target);
    } catch {
      throw new Error("Forbidden path");
    }
    if (!isInside(realWorkdir, realTarget)) throw new Error("Forbidden path");
  }

  return target;
}

export function prepareProviderWorkspace(
  userData: string,
  clusterId: string,
  providerId: string,
  explicitScaffoldsRoot?: string,
): { workdir: string; seeded: boolean } {
  const provider = getAiCliProvider(providerId);
  const workdir = getWorkdir(userData, clusterId, provider.id);
  const scaffold = resolveProviderScaffold(provider.id, explicitScaffoldsRoot);
  let seeded = false;

  for (const editor of provider.editors) {
    const target = resolveDeclaredFile(workdir, provider.id, editor.path);
    if (existsSync(target)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(scaffold, editor.path), target);
    seeded = true;
  }

  return { workdir, seeded };
}

export function readProviderFile(
  userData: string,
  clusterId: string,
  providerId: string,
  relPath: string,
): { content: string; exists: boolean } {
  const workdir = getWorkdir(userData, clusterId, providerId);
  const target = resolveDeclaredFile(workdir, providerId, relPath);

  try {
    return { content: readFileSync(target, "utf8"), exists: true };
  } catch (error: any) {
    if (error?.code === "ENOENT") return { content: "", exists: false };
    throw error;
  }
}

export function writeProviderFile(
  userData: string,
  clusterId: string,
  providerId: string,
  relPath: string,
  content: string,
): { ok: true; bytes: number } {
  const workdir = getWorkdir(userData, clusterId, providerId);
  const target = resolveDeclaredFile(workdir, providerId, relPath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");

  return { ok: true, bytes: Buffer.byteLength(content, "utf8") };
}

export function resetProvider(
  userData: string,
  clusterId: string,
  providerId: string,
  explicitScaffoldsRoot?: string,
): { workdir: string; seeded: boolean } {
  const provider = getAiCliProvider(providerId);
  const workdir = getWorkdir(userData, clusterId, provider.id);

  for (const relPath of provider.resetPaths) {
    const target = resolveDeclaredFile(workdir, provider.id, relPath);
    if (existsSync(target)) rmSync(target, { force: true });
  }

  return prepareProviderWorkspace(userData, clusterId, provider.id, explicitScaffoldsRoot);
}

export async function revealProviderWorkspace(
  userData: string,
  clusterId: string,
  providerId: string,
  openPath: OpenPath,
): Promise<{ ok: boolean; error?: string }> {
  try {
    getAiCliProvider(providerId);
    const sessionsRoot = realpathSync(path.join(userData, "ai-cli-sessions"));
    const workdir = realpathSync(computeProviderWorkdir(userData, clusterId, providerId));
    if (!isInside(sessionsRoot, workdir)) return { ok: false, error: "Forbidden path" };

    const result = await openPath(workdir);
    return result === "" ? { ok: true } : { ok: false, error: result };
  } catch (error: any) {
    return { ok: false, error: error?.message ?? String(error) };
  }
}
