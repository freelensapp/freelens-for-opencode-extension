import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import { HarnessFileEditor } from "./agents-md-editor";
import { getLaunchCommand } from "./get-launch-command";
import { type SectionTheme, sectionThemeStore } from "./section-theme";

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

const THEME_OPTIONS: { value: SectionTheme; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

// ponytail: the theme picker used to be three side-by-side Buttons crammed into
// the header. Replaced with a single Select so it takes one control's worth of
// width and reads as a chooser rather than three competing actions.
const SectionThemeSelect = observer(function SectionThemeSelect() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "0.85em", opacity: 0.8 }}>Theme</span>
      <div style={{ width: "140px" }}>
        <Renderer.Component.Select
          id="section-theme-select"
          themeName="lens"
          options={THEME_OPTIONS}
          value={sectionThemeStore.pref}
          isClearable={false}
          menuPlacement="auto"
          onChange={(opt) => {
            if (opt) sectionThemeStore.setPref(opt.value);
          }}
        />
      </div>
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
    // ponytail: plain padded div, NOT Renderer.Component.SettingLayout — that
    // renders a full settings-page shell with its own back-button nav that
    // replaces the cluster view (sidebar disappears). We only want edge padding.
    //
    // The cluster page host area does not scroll for us, so the outer div owns
    // the scroll: height 100% + overflowY auto keeps tall content (the two
    // editors) reachable instead of clipped. box-sizing keeps the padding
    // inside the 100% height.
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "var(--padding, 16px)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
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
          <SectionThemeSelect />
        </div>

        {state.status === "missing" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <Renderer.Component.Icon material="error_outline" />
            <span>{state.error}</span>
            <Renderer.Component.Button outlined label="Retry" onClick={() => void refresh()} />
          </div>
        )}

        {state.status === "ready" && state.workdir && (
          <>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
            <HarnessFileEditor workdir={state.workdir} relPath="AGENTS.md" title="AGENTS.md" language="markdown" />
            <HarnessFileEditor
              workdir={state.workdir}
              relPath=".opencode/opencode.json"
              title="Permissions (.opencode/opencode.json)"
              language="json"
            />
          </>
        )}
      </div>

      {/* ponytail: no test for this page — it's a thin shell over public APIs
          (createTerminalTab + sendCommand + ipcRenderer.invoke + Monaco + host
          components). Manual smoke only. */}
    </div>
  );
});
