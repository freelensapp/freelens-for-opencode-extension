import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  defaultExtensionSettings,
  type ExtensionSettings,
  normalizeExtensionSettings,
} from "../common/extension-settings";

const SETTINGS_FILE = "ai-cli-extension-settings.json";

export function readExtensionSettings(userData: string): ExtensionSettings {
  try {
    return normalizeExtensionSettings(JSON.parse(readFileSync(path.join(userData, SETTINGS_FILE), "utf8")));
  } catch {
    return { ...defaultExtensionSettings };
  }
}

export function writeExtensionSettings(userData: string, settings: unknown): ExtensionSettings {
  const normalized = normalizeExtensionSettings(settings);

  mkdirSync(userData, { recursive: true });
  writeFileSync(path.join(userData, SETTINGS_FILE), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return normalized;
}
