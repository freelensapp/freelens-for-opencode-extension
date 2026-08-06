import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import { HarnessFileEditor } from "./agents-md-editor";
import { getLaunchCommand } from "./get-launch-command";
import { type SectionTheme, sectionThemeStore } from "./section-theme";

import type { ProviderCheckResult } from "../common/ai-cli-providers";

// ponytail: extension uses raw electron ipcRenderer directly instead of the
// Renderer.Ipc abstraction exported by @freelensapp/extensions. Reason:
// Renderer.Ipc is published as the ABSTRACT CLASS IpcRenderer (not an
// instance); its `invoke` method is an instance method, so
// Renderer.Ipc.invoke(...) does not typecheck against
// @freelensapp/extensions@1.10.2's declarations. Raw ipcRenderer + hardcoded
// channel prefix matches the main side (Task 6). Upgrade path: if a future
// Freelens release exposes a concrete per-extension IpcRenderer instance,
// switch back to get the auto-prefixed channel + auto-cleanup disposers.
const CHANNEL_PREFIX = "ai-cli-extension:";

type Status = "loading" | "ready" | "missing" | "error";

interface PageState {
  status: Status;
  clusterId?: string;
  version?: string;
  workdir?: string;
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

const THEME_OPTIONS: { value: SectionTheme; label: string; icon: string }[] = [
  { value: "auto", label: "Auto", icon: "brightness_auto" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "light", label: "Light", icon: "light_mode" },
];

const SectionThemeToggle = observer(function SectionThemeToggle() {
  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {THEME_OPTIONS.map((opt) => {
        const active = sectionThemeStore.pref === opt.value;
        return (
          <Renderer.Component.Button
            key={opt.value}
            outlined={!active}
            primary={active}
            tooltip={`${opt.label} theme`}
            onClick={() => sectionThemeStore.setPref(opt.value)}
          >
            <Renderer.Component.Icon material={opt.icon} small />
            {opt.label}
          </Renderer.Component.Button>
        );
      })}
    </div>
  );
});

export const AgentSessionPage = observer(function AgentSessionPage({ extension: _extension }: AgentSessionPageProps) {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [launching, setLaunching] = useState(false);

  const clusterId = Renderer.Catalog.getActiveCluster()?.id ?? null;

  async function refresh() {
    setState({ status: "loading" });
    try {
      if (!clusterId) {
        setState({ status: "error", error: "No active cluster. Open a cluster first." });
        return;
      }
      const [check, harness] = await Promise.all([
        ipcRenderer.invoke("ai-cli-extension:check-provider", "opencode") as Promise<ProviderCheckResult>,
        ipcRenderer.invoke(
          `${CHANNEL_PREFIX}prepare-workspace`,
          clusterId,
          "opencode",
        ) as Promise<PrepareHarnessResult>,
      ]);
      if (check.status !== "ready") {
        setState({ status: check.status, error: check.error, workdir: harness.workdir });
        return;
      }
      setState({ status: "ready", clusterId, version: check.version, workdir: harness.workdir });
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
    setLaunching(true);
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
      setLaunching(false);
    };

    const poll = setInterval(() => {
      const api = (Renderer.Component.terminalStore as any).getTerminalApi?.(tabId);
      if (api?.isReady) send();
    }, 100);
    timeoutId = setTimeout(send, 15_000);
  }

  async function reveal() {
    if (!state.workdir) return;
    const result = (await ipcRenderer.invoke(
      `${CHANNEL_PREFIX}reveal-workspace`,
      state.clusterId,
      "opencode",
    )) as RevealPathResult;
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
    const result = (await ipcRenderer.invoke(
      `${CHANNEL_PREFIX}reset-provider`,
      state.clusterId,
      "opencode",
    )) as ResetHarnessResult;
    if (!result.ok) {
      Renderer.Component.Notifications.error(`Reset failed: ${result.error ?? "unknown"}`);
      return;
    }
    await refresh();
  }

  return (
    // ponytail: plain padded div, NOT Renderer.Component.SettingLayout — that
    // renders a full settings-page shell with its own back-button nav that
    // replaces the cluster view (sidebar disappears). We only want edge padding.
    <div style={{ padding: "var(--padding, 16px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
        <SectionThemeToggle />
      </div>

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

      {state.status === "ready" && state.workdir && state.clusterId && (
        <>
          <div>
            Working directory: <code>{state.workdir}</code>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
            <Renderer.Component.Button
              primary
              label="Open agent session"
              onClick={launch}
              disabled={!clusterId || launching}
              waiting={launching}
            />
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
          <HarnessFileEditor
            workdir={state.workdir}
            clusterId={state.clusterId}
            relPath="AGENTS.md"
            title="AGENTS.md"
            language="markdown"
          />
          <HarnessFileEditor
            workdir={state.workdir}
            clusterId={state.clusterId}
            relPath=".opencode/opencode.json"
            title="Permissions (.opencode/opencode.json)"
            language="json"
          />
        </>
      )}

      {/* ponytail: no test for this page — it's a thin shell over public APIs
          (createTerminalTab + sendCommand + ipcRenderer.invoke + Monaco + host
          components). Manual smoke only. */}
    </div>
  );
});
