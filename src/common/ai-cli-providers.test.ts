import { describe, expect, it } from "vitest";
import { aiCliProviders, getAiCliProvider } from "./ai-cli-providers";

describe("aiCliProviders", () => {
  it("lists products in intended order", () => {
    expect(aiCliProviders.map(({ id }) => id)).toEqual(["opencode", "claude", "copilot"]);
  });

  it("has unique stable IDs", () => {
    const ids = aiCliProviders.map(({ id }) => id);

    expect(new Set(ids)).toHaveLength(ids.length);
  });

  it("uses safe relative editor and reset paths", () => {
    for (const provider of aiCliProviders) {
      const editorPaths = provider.editors.map(({ path }) => path);

      for (const path of [...editorPaths, ...provider.resetPaths]) {
        expect(path).not.toContain("\0");
        expect(path.split(/[\\/]/)).not.toContain("..");
        expect(path).not.toMatch(/^(?:[\\/]|[A-Za-z]:)/);
      }

      for (const path of provider.resetPaths) {
        expect(editorPaths).toContain(path);
      }
    }
  });

  it("rejects unknown providers", () => {
    expect(() => getAiCliProvider("unknown")).toThrow("Unsupported AI CLI provider");
  });
});
