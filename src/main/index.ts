import { Main } from "@freelensapp/extensions";
import { app, ipcMain } from "electron";
import { checkOpencodeInstalled } from "./check-opencode-installed";
import { computeWorkdir, ensureWorkdir } from "./get-agent-workdir";

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
    ipcMain.handle(`${CHANNEL_PREFIX}check-opencode-installed`, async () => {
      try {
        return await checkOpencodeInstalled();
      } catch (err: any) {
        return { installed: false, error: err?.message ?? String(err) };
      }
    });

    ipcMain.handle(`${CHANNEL_PREFIX}get-agent-workdir`, async (_event, clusterId: string) => {
      try {
        const workdir = computeWorkdir(app.getPath("userData"), clusterId);
        return ensureWorkdir(workdir);
      } catch (err: any) {
        throw new Error(`Could not prepare workspace: ${err?.message ?? err}`);
      }
    });
  }
}
