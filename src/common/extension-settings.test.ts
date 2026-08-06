import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROBE_TIMEOUT_MS,
  MAX_PROBE_TIMEOUT_MS,
  MIN_PROBE_TIMEOUT_MS,
  normalizeExtensionSettings,
  normalizeProbeTimeoutMs,
} from "./extension-settings";

describe("normalizeProbeTimeoutMs", () => {
  it.each([
    ["a number in range", 20_000, 20_000],
    ["a numeric string", "8000", 8_000],
    ["a fractional number", 7_500.4, 7_500],
    ["a value below the minimum", 10, MIN_PROBE_TIMEOUT_MS],
    ["a value above the maximum", 10_000_000, MAX_PROBE_TIMEOUT_MS],
  ])("clamps %s", (_, input, expected) => {
    expect(normalizeProbeTimeoutMs(input)).toBe(expected);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a non-numeric string", "soon"],
    ["an empty string", ""],
    ["an object", {}],
  ])("falls back to the default for %s", (_, input) => {
    expect(normalizeProbeTimeoutMs(input)).toBe(DEFAULT_PROBE_TIMEOUT_MS);
  });
});

describe("normalizeExtensionSettings", () => {
  it("keeps valid settings", () => {
    expect(normalizeExtensionSettings({ probeTimeoutMs: 30_000 })).toEqual({ probeTimeoutMs: 30_000 });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "settings"],
    ["an empty object", {}],
    ["an object with junk", { probeTimeoutMs: "junk", extra: true }],
  ])("returns defaults for %s", (_, input) => {
    expect(normalizeExtensionSettings(input)).toEqual({ probeTimeoutMs: DEFAULT_PROBE_TIMEOUT_MS });
  });
});
