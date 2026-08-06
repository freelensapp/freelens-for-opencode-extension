export interface ExtensionSettings {
  probeTimeoutMs: number;
}

export const DEFAULT_PROBE_TIMEOUT_MS = 15_000;
export const MIN_PROBE_TIMEOUT_MS = 1_000;
export const MAX_PROBE_TIMEOUT_MS = 300_000;

export const defaultExtensionSettings: ExtensionSettings = {
  probeTimeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
};

export function normalizeProbeTimeoutMs(value: unknown): number {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    return DEFAULT_PROBE_TIMEOUT_MS;
  }

  return Math.min(MAX_PROBE_TIMEOUT_MS, Math.max(MIN_PROBE_TIMEOUT_MS, Math.round(parsed)));
}

export function normalizeExtensionSettings(value: unknown): ExtensionSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<
    Record<keyof ExtensionSettings, unknown>
  >;

  return { probeTimeoutMs: normalizeProbeTimeoutMs(raw.probeTimeoutMs) };
}
