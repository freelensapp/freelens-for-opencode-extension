import { Main } from "@freelensapp/extensions";
import { app, ipcMain, shell } from "electron";
import { checkProvider } from "./check-provider";
import {
  prepareProviderWorkspace,
  readProviderFile,
  resetProvider,
  revealProviderWorkspace,
  writeProviderFile,
} from "./provider-files";

// ponytail: extension uses raw electron ipcMain directly instead of the
// Main.Ipc abstraction exported by @freelensapp/extensions. Reason: Main.Ipc
// is published as the ABSTRACT CLASS IpcMain (not an instance); its `handle`
// method is an instance method, so Main.Ipc.handle(...) does not typecheck
// against @freelensapp/extensions@1.10.2's declarations. Raw ipcMain +
// hardcoded channel prefix is the minimal working interface. Upgrade path: if
// a future Freelens release exposes a concrete per-extension IpcMain instance
// (e.g. `Main.Ipc.getInstance(...).handle(...)`), switch back to get the
// auto-prefixed channel + auto-cleanup disposers. Channel prefix below is
// unique enough to avoid collisions with other extensions.
const CHANNEL_PREFIX = "opencode-extension:";

export default class OpencodeMainExtension extends Main.LensExtension {
  async onActivate() {
    ipcMain.removeHandler("ai-cli-extension:check-provider");
    ipcMain.handle("ai-cli-extension:check-provider", (_event, providerId: string) => checkProvider(providerId));

    // Existing OpenCode channels stay stable while their file operations derive
    // the provider workdir from trusted cluster and provider inputs.
    ipcMain.handle(`${CHANNEL_PREFIX}prepare-harness`, async (_event, clusterId: string) => {
      try {
        return prepareProviderWorkspace(app.getPath("userData"), clusterId, "opencode");
      } catch (err: any) {
        throw new Error(`Could not prepare harness: ${err?.message ?? err}`);
      }
    });

    ipcMain.handle(`${CHANNEL_PREFIX}read-harness-file`, async (_event, clusterId: string, relPath: string) => {
      try {
        return readProviderFile(app.getPath("userData"), clusterId, "opencode", relPath);
      } catch (err: any) {
        throw new Error(`Could not read harness file: ${err?.message ?? err}`);
      }
    });

    ipcMain.handle(
      `${CHANNEL_PREFIX}write-harness-file`,
      async (_event, clusterId: string, relPath: string, content: string) => {
        try {
          return writeProviderFile(app.getPath("userData"), clusterId, "opencode", relPath, content);
        } catch (err: any) {
          throw new Error(`Could not write harness file: ${err?.message ?? err}`);
        }
      },
    );

    ipcMain.handle(`${CHANNEL_PREFIX}reveal-path`, async (_event, clusterId: string) => {
      return revealProviderWorkspace(app.getPath("userData"), clusterId, "opencode", shell.openPath);
    });

    ipcMain.handle(`${CHANNEL_PREFIX}reset-harness`, async (_event, clusterId: string) => {
      try {
        resetProvider(app.getPath("userData"), clusterId, "opencode");
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
      }
    });
  }
}
