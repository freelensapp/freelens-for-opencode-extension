import { Main } from "@freelensapp/extensions";
import { app, ipcMain } from "electron";
import { checkProvider } from "./check-provider";
import { ensureHarness, resetHarness } from "./ensure-harness";
import { computeProviderWorkdir } from "./get-provider-workdir";
import { assertSessionsWorkdir, safeRead, safeWrite } from "./harness-file";
import { revealPath } from "./reveal-path";

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

    // Returns { workdir, seeded }. Computes workdir, mkdir -p, seeds scaffold
    // from out/main/scaffold/ on first open. Replaces get-agent-workdir: it
    // returns the workdir too, so the renderer needs only this handler.
    ipcMain.handle(`${CHANNEL_PREFIX}prepare-harness`, async (_event, clusterId: string) => {
      try {
        const workdir = computeProviderWorkdir(app.getPath("userData"), clusterId, "opencode");
        return ensureHarness(workdir);
      } catch (err: any) {
        throw new Error(`Could not prepare harness: ${err?.message ?? err}`);
      }
    });

    ipcMain.handle(`${CHANNEL_PREFIX}read-harness-file`, async (_event, workdir: string, relPath: string) => {
      try {
        const realWd = assertSessionsWorkdir(app.getPath("userData"), workdir);
        return safeRead(realWd, relPath);
      } catch (err: any) {
        throw new Error(`Could not read harness file: ${err?.message ?? err}`);
      }
    });

    ipcMain.handle(
      `${CHANNEL_PREFIX}write-harness-file`,
      async (_event, workdir: string, relPath: string, content: string) => {
        try {
          const realWd = assertSessionsWorkdir(app.getPath("userData"), workdir);
          return safeWrite(realWd, relPath, content);
        } catch (err: any) {
          throw new Error(`Could not write harness file: ${err?.message ?? err}`);
        }
      },
    );

    ipcMain.handle(`${CHANNEL_PREFIX}reveal-path`, async (_event, absPath: string) => {
      return revealPath(app.getPath("userData"), absPath);
    });

    ipcMain.handle(`${CHANNEL_PREFIX}reset-harness`, async (_event, workdir: string) => {
      try {
        const realWd = assertSessionsWorkdir(app.getPath("userData"), workdir);
        resetHarness(realWd);
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? String(err) };
      }
    });
  }
}
