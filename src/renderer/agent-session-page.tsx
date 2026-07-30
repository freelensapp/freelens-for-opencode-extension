import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import { AgentsMdEditor } from "./agents-md-editor";
import { getLaunchCommand } from "./get-launch-command";

// ponytail: extension uses raw electron ipcRenderer directly instead of the
// Renderer.Ipc abstraction exported by @freelensapp/extensions. Reason:
// Renderer.Ipc is published as the ABSTRACT CLASS IpcRenderer (not an
// instance); its `invoke` method is an instance method, so
// Renderer.Ipc.invoke(...) does not typecheck against
// @freelensapp/extensions@1.10.2's declarations. Raw ipcRenderer + hardcoded
// channel prefix matches the main side (Task 6). Upgrade path: if a future
// Freelens release exposes a concrete per-extension IpcRenderer instance,
// switch back to get the auto-prefixed channel + auto-cleanup disposers.
const CHANNEL_PREFIX = "opencode-extension:";

type Status = "loading" | "ready" | "missing" | "error";

interface PageState {
  status: Status;
  version?: string;
  workdir?: string;
  error?: string;
}

interface OpencodeCheckResult {
  installed: boolean;
  version?: string;
  error?: string;
}

interface PrepareHarnessResult {
  workdir: string;
  seeded: boolean;
}

interface ResetHarnessResult {
  ok: boolean;
  error?: string;
}

interface RevealPathResult {
  ok: boolean;
  error?: string;
}

interface AgentSessionPageProps {
  extension: Renderer.LensExtension;
}

export const AgentSessionPage = observer(function AgentSessionPage({ extension: _extension }: AgentSessionPageProps) {
  const [state, setState] = useState<PageState>({ status: "loading" });

  const clusterId = Renderer.Catalog.getActiveCluster()?.id ?? null;

  async function refresh() {
    setState({ status: "loading" });
    try {
      if (!clusterId) {
        setState({ status: "error", error: "No active cluster. Open a cluster first." });
        return;
      }
      const [check, harness] = await Promise.all([
        ipcRenderer.invoke(`${CHANNEL_PREFIX}check-opencode-installed`) as Promise<OpencodeCheckResult>,
        ipcRenderer.invoke(`${CHANNEL_PREFIX}prepare-harness`, clusterId) as Promise<PrepareHarnessResult>,
      ]);
      if (!check.installed) {
        setState({ status: "missing", error: check.error, workdir: harness.workdir });
        return;
      }
      setState({ status: "ready", version: check.version, workdir: harness.workdir });
    } catch (err: any) {
      setState({ status: "error", error: err?.message ?? String(err) });
    }
  }

  useEffect(() => {
    void refresh();
    // refresh runs on clusterId change only; `refresh` identity is stable per render but lint rule is off in biome.jsonc
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId]);

  function launch() {
    if (state.status !== "ready" || !state.workdir) return;
    const tabId = Renderer.Component.createTerminalTab({ title: "Agent Session" }).id;
    const launchCmd = getLaunchCommand(state.workdir, process.platform);

    let sent = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const send = () => {
      if (sent) return;
      sent = true;
      clearInterval(poll);
      clearTimeout(timeoutId);
      void Renderer.Component.terminalStore.sendCommand(launchCmd, { tabId, enter: true });
    };

    const poll = setInterval(() => {
      const api = (Renderer.Component.terminalStore as any).getTerminalApi?.(tabId);
      if (api?.isReady) send();
    }, 100);
    timeoutId = setTimeout(send, 15_000);
  }

  async function reveal() {
    if (!state.workdir) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reveal-path`, state.workdir)) as RevealPathResult;
    if (!result.ok) {
      // ponytail: transient reveal failures surface as a host toast, not inline red text (spec §2).
      Renderer.Component.Notifications.error(`Reveal failed: ${result.error ?? "unknown"}`);
    }
  }

  async function reset() {
    if (state.status !== "ready" || !state.workdir) return;
    // ConfirmDialog.confirm returns Promise<boolean> (true=ok, false=cancel).
    // ConfirmDialog.open is fire-and-forget and cannot be awaited — see plan's spec reconciliation §1.
    const ok = await Renderer.Component.ConfirmDialog.confirm({
      message: "Delete .opencode/ and re-seed the scaffold? Your AGENTS.md is preserved.",
      labelOk: "Delete",
      labelCancel: "Cancel",
    });
    if (!ok) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reset-harness`, state.workdir)) as ResetHarnessResult;
    if (!result.ok) {
      Renderer.Component.Notifications.error(`Reset failed: ${result.error ?? "unknown"}`);
      return;
    }
    await refresh();
  }

  return (
    <div>
      <Renderer.Component.SubTitle title="Agent Session">
        {state.status === "ready" && (
          <>
            <Renderer.Component.StatusBrick className="running" /> opencode v{state.version}
          </>
        )}
        {state.status === "loading" && (
          <>
            <Renderer.Component.StatusBrick className="waiting" /> Checking for opencode…
          </>
        )}
        {(state.status === "missing" || state.status === "error") && (
          <Renderer.Component.StatusBrick className="failed" />
        )}
      </Renderer.Component.SubTitle>

      {state.status === "missing" && (
        <div>
          <Renderer.Component.Icon material="error_outline" />
          <span>opencode not found on PATH</span>
          <Renderer.Component.Button plain href="https://opencode.ai/docs/" target="_blank">
            opencode docs
          </Renderer.Component.Button>
          {state.error && <span>{state.error}</span>}
          <Renderer.Component.Button outlined label="Retry" onClick={() => void refresh()} />
        </div>
      )}

      {state.status === "error" && (
        <div>
          <Renderer.Component.Icon material="error_outline" />
          <span>{state.error}</span>
          <Renderer.Component.Button outlined label="Retry" onClick={() => void refresh()} />
        </div>
      )}

      {state.status === "ready" && state.workdir && (
        <>
          <div>
            Working directory: <code>{state.workdir}</code>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
            <Renderer.Component.Button primary label="Open agent session" onClick={launch} disabled={!clusterId} />
            <Renderer.Component.Button outlined label="Reveal workdir" onClick={() => void reveal()} />
            <Renderer.Component.Button
              outlined
              tooltip="Delete .opencode/ to reseed scaffold"
              onClick={() => void reset()}
            >
              <Renderer.Component.Icon material="restart_alt" small />
              Reset
            </Renderer.Component.Button>
          </div>
          <Renderer.Component.Gutter />
          <AgentsMdEditor workdir={state.workdir} />
        </>
      )}

      {/* ponytail: no test for this page — it's a thin shell over public APIs
          (createTerminalTab + sendCommand + ipcRenderer.invoke + Monaco + host
          components). Manual smoke only. */}
    </div>
  );
});
