import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import { useEffect, useRef, useState } from "react";
import { aiCliProviders, getAiCliProvider } from "../common/ai-cli-providers";
import { getLaunchCommand } from "./get-launch-command";
import { ProviderFileEditor } from "./provider-file-editor";
import { loadProvider, loadSelectedProvider, saveSelectedProvider } from "./provider-selection";
import { type SectionTheme, sectionThemeStore } from "./section-theme";

import type { AiCliProviderId } from "../common/ai-cli-providers";
import type { ProviderLoadResult } from "./provider-selection";

const CHANNEL_PREFIX = "ai-cli-extension:";

type PageState = { status: "idle" | "loading" } | ProviderLoadResult;

interface AiCliPageProps {
  extension: Renderer.LensExtension;
}

const themeOptions: { value: SectionTheme; label: string; icon: string }[] = [
  { value: "auto", label: "Auto", icon: "brightness_auto" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "light", label: "Light", icon: "light_mode" },
];

const SectionThemeToggle = observer(function SectionThemeToggle() {
  return (
    <div style={{ display: "flex", gap: "4px" }}>
      {themeOptions.map((option) => (
        <Renderer.Component.Button
          key={option.value}
          outlined={sectionThemeStore.pref !== option.value}
          primary={sectionThemeStore.pref === option.value}
          tooltip={`${option.label} theme`}
          onClick={() => sectionThemeStore.setPref(option.value)}
        >
          <Renderer.Component.Icon material={option.icon} small />
          {option.label}
        </Renderer.Component.Button>
      ))}
    </div>
  );
});

export const AiCliPage = observer(function AiCliPage({ extension: _extension }: AiCliPageProps) {
  const clusterId = Renderer.Catalog.getActiveCluster()?.id;
  const [selection, setSelection] = useState<{ clusterId?: string; providerId?: AiCliProviderId }>(() => ({
    clusterId,
    providerId: clusterId ? loadSelectedProvider(clusterId) : undefined,
  }));
  const [state, setState] = useState<PageState>({ status: "idle" });
  const [retry, setRetry] = useState(0);
  const [launching, setLaunching] = useState(false);
  const generation = useRef(0);
  const providerId = selection.clusterId === clusterId ? selection.providerId : undefined;
  const provider = providerId ? getAiCliProvider(providerId) : undefined;
  const hasCurrentSelection = selection.clusterId === clusterId;
  const currentRequest = useRef({ clusterId, providerId });

  currentRequest.current = { clusterId, providerId };

  useEffect(() => {
    generation.current++;
    setState({ status: "idle" });
    setSelection({ clusterId, providerId: clusterId ? loadSelectedProvider(clusterId) : undefined });
    setRetry(0);
  }, [clusterId]);

  useEffect(() => {
    const request = ++generation.current;

    if (!clusterId || !providerId) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    void loadProvider(
      clusterId,
      providerId,
      ipcRenderer.invoke,
      () =>
        generation.current === request &&
        currentRequest.current.clusterId === clusterId &&
        currentRequest.current.providerId === providerId,
    ).then((result) => {
      if (result) setState(result);
    });

    return () => {
      generation.current++;
    };
  }, [clusterId, providerId, retry]);

  function selectProvider(nextProviderId: AiCliProviderId) {
    if (!clusterId || (state.status === "loading" && nextProviderId === providerId)) return;
    generation.current++;
    setState({ status: "idle" });
    saveSelectedProvider(clusterId, nextProviderId);
    setSelection({ clusterId, providerId: nextProviderId });
    setRetry(0);
  }

  function retryProvider() {
    generation.current++;
    setRetry((current) => current + 1);
  }

  function launch() {
    if (!provider || state.status !== "ready") return;
    setLaunching(true);
    const tabId = Renderer.Component.createTerminalTab({ title: `${provider.name} Session` }).id;
    const command = getLaunchCommand(state.workdir, provider.id, process.platform);
    let sent = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const send = () => {
      if (sent) return;
      sent = true;
      clearInterval(poll);
      clearTimeout(timeoutId);
      void Renderer.Component.terminalStore.sendCommand(command, { tabId, enter: true });
      setLaunching(false);
    };
    const poll = setInterval(() => {
      const api = (Renderer.Component.terminalStore as any).getTerminalApi?.(tabId);
      if (api?.isReady) send();
    }, 100);

    timeoutId = setTimeout(send, 15_000);
  }

  async function reveal() {
    if (!clusterId || !provider) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reveal-workspace`, clusterId, provider.id)) as {
      ok: boolean;
      error?: string;
    };

    if (!result.ok) Renderer.Component.Notifications.error(`Reveal failed: ${result.error ?? "unknown"}`);
  }

  async function reset() {
    if (!clusterId || !provider || state.status !== "ready") return;
    const ok = await Renderer.Component.ConfirmDialog.confirm({
      message: `Reset ${provider.name} managed paths (${provider.resetPaths.join(", ")})? This preserves instructions and unrelated files.`,
      labelOk: "Reset",
      labelCancel: "Cancel",
    });

    if (!ok) return;
    const result = (await ipcRenderer.invoke(`${CHANNEL_PREFIX}reset-provider`, clusterId, provider.id)) as {
      ok: boolean;
      error?: string;
    };

    if (!result.ok) {
      Renderer.Component.Notifications.error(`Reset failed: ${result.error ?? "unknown"}`);
      return;
    }
    retryProvider();
  }

  return (
    <div style={{ padding: "var(--padding, 16px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Renderer.Component.SubTitle title={provider ? `${provider.name} Session` : "Freelens AI CLI"}>
          {hasCurrentSelection && state.status === "ready" && (
            <>
              <Renderer.Component.StatusBrick className="running" /> {provider?.name} v{state.version}
            </>
          )}
          {hasCurrentSelection && state.status === "loading" && (
            <>
              <Renderer.Component.StatusBrick className="waiting" /> Checking {provider?.name}...
            </>
          )}
          {hasCurrentSelection && (state.status === "missing" || state.status === "error") && (
            <Renderer.Component.StatusBrick className="failed" />
          )}
        </Renderer.Component.SubTitle>
        <SectionThemeToggle />
      </div>

      <p>Select an AI CLI for this cluster. Provider workspaces are isolated per cluster.</p>
      <div style={{ display: "flex", gap: "8px" }}>
        {aiCliProviders.map((candidate) => (
          <Renderer.Component.Button
            key={candidate.id}
            primary={candidate.id === providerId}
            outlined={candidate.id !== providerId}
            disabled={!clusterId || (state.status === "loading" && candidate.id === providerId)}
            onClick={() => selectProvider(candidate.id)}
          >
            {candidate.id === providerId ? `Selected: ${candidate.name}` : `Select ${candidate.name}`}
          </Renderer.Component.Button>
        ))}
      </div>
      <p>
        CLI permissions are convenience guardrails. Kubernetes RBAC and kubeconfig permissions remain the security
        boundary.
      </p>

      {!clusterId && <p>No active cluster. Open a cluster first.</p>}
      {hasCurrentSelection && state.status === "missing" && provider && (
        <div>
          <Renderer.Component.Icon material="error_outline" />
          <span>{provider.name} not found on PATH</span>
          <Renderer.Component.Button plain href={provider.docsUrl} target="_blank">
            {provider.name} docs
          </Renderer.Component.Button>
          {state.error && <span>{state.error}</span>}
          <Renderer.Component.Button outlined label="Retry" onClick={retryProvider} />
        </div>
      )}
      {hasCurrentSelection && state.status === "error" && (
        <div>
          <Renderer.Component.Icon material="error_outline" />
          <span>{provider ? `${provider.name}: ${state.error}` : state.error}</span>
          <Renderer.Component.Button outlined label="Retry" onClick={retryProvider} />
        </div>
      )}
      {hasCurrentSelection && state.status === "ready" && provider && clusterId && (
        <>
          <div>
            Working directory: <code>{state.workdir}</code>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "0.5rem" }}>
            <Renderer.Component.Button
              primary
              label={`Open ${provider.name} session`}
              onClick={launch}
              disabled={launching}
              waiting={launching}
            />
            <Renderer.Component.Button outlined label="Reveal workdir" onClick={() => void reveal()} />
            <Renderer.Component.Button outlined onClick={() => void reset()}>
              <Renderer.Component.Icon material="restart_alt" small />
              Reset
            </Renderer.Component.Button>
          </div>
          <Renderer.Component.Gutter />
          {provider.editors.map((editor) => (
            <ProviderFileEditor key={editor.path} clusterId={clusterId} providerId={provider.id} editor={editor} />
          ))}
        </>
      )}
    </div>
  );
});
