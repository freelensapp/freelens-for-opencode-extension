import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import { getLaunchCommand } from "./get-launch-command";

// ponytail: extension uses raw electron ipcRenderer directly instead of the
// Renderer.Ipc abstraction exported by @freelensapp/extensions. Reason:
// Renderer.Ipc is published as the ABSTRACT CLASS IpcRenderer (not an
// instance); its `invoke` method is an instance method, so
// Renderer.Ipc.invoke(...) does not typecheck against
// @freelensapp/extensions@1.10.2's declarations. Raw ipcRenderer + hardcoded
// channel prefix matches the main side (Task 4). Upgrade path: if a future
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

interface AgentSessionPageProps {
  extension: Renderer.LensExtension;
}

export const AgentSessionPage = observer(function AgentSessionPage({ extension: _extension }: AgentSessionPageProps) {
  const [state, setState] = useState<PageState>({ status: "loading" });

  // Renderer.Catalog.getActiveCluster() returns the ClusterInfo DTO
  // ({ id, kubeConfigPath, contextName, ... }) — we need its `id`.
  // observer() re-renders when activeCluster changes.
  const clusterId = Renderer.Catalog.getActiveCluster()?.id ?? null;

  async function refresh() {
    setState({ status: "loading" });
    try {
      if (!clusterId) {
        setState({ status: "error", error: "No active cluster. Open a cluster first." });
        return;
      }
      const [check, workdir] = await Promise.all([
        ipcRenderer.invoke(`${CHANNEL_PREFIX}check-opencode-installed`) as Promise<OpencodeCheckResult>,
        ipcRenderer.invoke(`${CHANNEL_PREFIX}get-agent-workdir`, clusterId) as Promise<string>,
      ]);
      if (!check.installed) {
        setState({ status: "missing", error: check.error });
        return;
      }
      setState({ status: "ready", version: check.version, workdir });
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

    // ponytail: poll terminal readiness before sending. sendCommand's internal
    // waitUntilDefined can race with React mounting TerminalWindow, causing
    // commands to hang or drop. We wait for the API to be ready, then
    // sendCommand's internal waits resolve instantly. 15s fallback matches
    // sendCommand's own timeout ceiling.
    const poll = setInterval(() => {
      const api = (Renderer.Component.terminalStore as any).getTerminalApi?.(tabId);
      if (api?.isReady) send();
    }, 100);
    timeoutId = setTimeout(send, 15_000);
  }

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h2>Agent Session</h2>

      {state.status === "loading" && <p>Checking for opencode…</p>}

      {state.status === "missing" && (
        <div style={{ border: "1px solid #c00", padding: "0.75rem", color: "#c00" }}>
          <p>
            opencode not found on PATH. Install:{" "}
            <a href="https://opencode.ai/docs/" target="_blank" rel="noreferrer">
              https://opencode.ai/docs/
            </a>
          </p>
          {state.error && <p style={{ fontSize: "0.85em" }}>Detail: {state.error}</p>}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}

      {state.status === "error" && (
        <div style={{ border: "1px solid #c00", padding: "0.75rem", color: "#c00" }}>
          {state.error}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}

      {state.status === "ready" && (
        <div style={{ border: "1px solid #080", padding: "0.75rem", color: "#080" }}>
          <p>opencode detected (v{state.version}).</p>
          <p>
            Working directory: <code>{state.workdir}</code>
          </p>
          <button onClick={launch} disabled={!clusterId}>
            Open agent session
          </button>
        </div>
      )}

      {/* ponytail: no test for this page — it's a thin shell over public APIs
          (createTerminalTab + sendCommand + ipcRenderer.invoke). Manual smoke only. */}
    </div>
  );
});
