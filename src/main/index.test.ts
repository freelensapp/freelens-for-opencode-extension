import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkProvider: vi.fn(),
  getPath: vi.fn(() => "/user-data"),
  handle: vi.fn(),
  openPath: vi.fn(),
  prepareProviderWorkspace: vi.fn(),
  readProviderFile: vi.fn(),
  removeHandler: vi.fn(),
  resetProvider: vi.fn(),
  revealProviderWorkspace: vi.fn(),
  writeProviderFile: vi.fn(),
}));

vi.mock("@freelensapp/extensions", () => ({
  Main: { LensExtension: class {} },
}));

vi.mock("electron", () => ({
  app: { getPath: mocks.getPath },
  ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
  shell: { openPath: mocks.openPath },
}));

vi.mock("./check-provider", () => ({ checkProvider: mocks.checkProvider }));
vi.mock("./provider-files", () => ({
  prepareProviderWorkspace: mocks.prepareProviderWorkspace,
  readProviderFile: mocks.readProviderFile,
  resetProvider: mocks.resetProvider,
  revealProviderWorkspace: mocks.revealProviderWorkspace,
  writeProviderFile: mocks.writeProviderFile,
}));

import AiCliMainExtension from "./index";

type Handler = (...args: unknown[]) => unknown;

function getHandler(channel: string): Handler {
  const call = mocks.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel);

  if (!call) throw new Error(`Missing IPC handler: ${channel}`);
  return call[1] as Handler;
}

describe("AiCliMainExtension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers provider-neutral handlers and replaces them on reactivation", async () => {
    const extension = new AiCliMainExtension({} as never);

    await extension.onActivate();
    await extension.onActivate();

    const channels = [
      "ai-cli-extension:check-provider",
      "ai-cli-extension:prepare-workspace",
      "ai-cli-extension:read-provider-file",
      "ai-cli-extension:write-provider-file",
      "ai-cli-extension:reveal-workspace",
      "ai-cli-extension:reset-provider",
    ];
    expect(mocks.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([...channels, ...channels]);
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual([...channels, ...channels]);

    await getHandler("ai-cli-extension:check-provider")({}, "claude");
    await getHandler("ai-cli-extension:prepare-workspace")({}, "cluster-1", "claude");
    await getHandler("ai-cli-extension:read-provider-file")({}, "cluster-1", "claude", "CLAUDE.md");
    await getHandler("ai-cli-extension:write-provider-file")({}, "cluster-1", "claude", "CLAUDE.md", "rules");
    await getHandler("ai-cli-extension:reveal-workspace")({}, "cluster-1", "claude");
    await getHandler("ai-cli-extension:reset-provider")({}, "cluster-1", "claude");

    expect(mocks.checkProvider).toHaveBeenCalledWith("claude");
    expect(mocks.prepareProviderWorkspace).toHaveBeenCalledWith("/user-data", "cluster-1", "claude");
    expect(mocks.readProviderFile).toHaveBeenCalledWith("/user-data", "cluster-1", "claude", "CLAUDE.md");
    expect(mocks.writeProviderFile).toHaveBeenCalledWith("/user-data", "cluster-1", "claude", "CLAUDE.md", "rules");
    expect(mocks.revealProviderWorkspace).toHaveBeenCalledWith("/user-data", "cluster-1", "claude", mocks.openPath);
    expect(mocks.resetProvider).toHaveBeenCalledWith("/user-data", "cluster-1", "claude");
  });

  it("returns reset errors to renderer", async () => {
    mocks.resetProvider.mockImplementation(() => {
      throw new Error("Unsupported AI CLI provider: unknown");
    });
    const extension = new AiCliMainExtension({} as never);

    await extension.onActivate();

    expect(getHandler("ai-cli-extension:reset-provider")({}, "cluster-1", "unknown")).toEqual({
      ok: false,
      error: "Unsupported AI CLI provider: unknown",
    });
  });
});
