import { loader, Editor as Monaco } from "@monaco-editor/react";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import * as monacoEditor from "monaco-editor";
// ponytail: Monaco bundling. Offline config — use the local `monaco-editor`
// npm package, never the CDN. loader.config must run before any Editor
// mounts; doing it at module-eval time is the documented pattern.
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useEffect, useRef, useState } from "react";
import { sectionThemeStore } from "./section-theme";

// self.MonacoEnvironment worker factory — required for Monaco to find the
// bundled worker. Assigned once at module eval.
(self as any).MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

loader.config({ monaco: monacoEditor as any });

const CHANNEL_PREFIX = "ai-cli-extension:";
const SAVE_DEBOUNCE_MS = 500;

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface HarnessFileEditorProps {
  workdir: string;
  clusterId: string;
  // Path relative to workdir. Defaults to AGENTS.md for backwards compat.
  relPath?: string;
  title?: string;
  language?: string;
}

export const HarnessFileEditor = observer(function HarnessFileEditor({
  workdir,
  clusterId,
  relPath = "AGENTS.md",
  title = relPath,
  language = "markdown",
}: HarnessFileEditorProps) {
  const [content, setContent] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  // Track the content that is currently committed to disk, so we don't write
  // when the editor load itself equalled the on-disk content.
  const committedRef = useRef<string>("");

  // Load file once per workdir/relPath.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setStatus("idle");
    setError(undefined);
    (async () => {
      try {
        const result = (await ipcRenderer.invoke(
          `${CHANNEL_PREFIX}read-provider-file`,
          clusterId,
          "opencode",
          relPath,
        )) as {
          content: string;
          exists: boolean;
        };
        if (cancelled) return;
        setContent(result.content);
        committedRef.current = result.content;
        setLoaded(true);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? String(err));
        setStatus("error");
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clusterId, workdir, relPath]);

  function onChange(value: string | undefined) {
    const next = value ?? "";
    setContent(next);
    setStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await ipcRenderer.invoke(`${CHANNEL_PREFIX}write-provider-file`, clusterId, "opencode", relPath, next);
        committedRef.current = next;
        setStatus("saved");
        setError(undefined);
        // ponytail: clear "Saved" badge back to idle after 1s so the badge
        // doesn't look stuck on a transient state.
        setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1000);
      } catch (err: any) {
        setStatus("error");
        setError(err?.message ?? String(err));
      }
    }, SAVE_DEBOUNCE_MS);
  }

  const badge = (() => {
    if (status === "saving") return { text: "Saving…", color: "var(--colorWarning)" };
    if (status === "saved") return { text: "Saved", color: "var(--colorOk)" };
    if (status === "error") return { text: `Save failed: ${error ?? "unknown"}`, color: "var(--colorError)" };
    return { text: "", color: "#888" };
  })();

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
        <strong>{title}</strong>
        {badge.text && <span style={{ color: badge.color, fontSize: "0.85em" }}>{badge.text}</span>}
      </div>
      <div
        style={{
          border: "1px solid var(--borderColor)",
          height: "360px",
          resize: "vertical",
          overflow: "hidden",
        }}
      >
        {loaded ? (
          <Monaco
            language={language}
            value={content}
            theme={sectionThemeStore.monacoTheme}
            onChange={(v) => onChange(v)}
            options={{
              wordWrap: "on",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
            loading={<p style={{ padding: "0.5rem" }}>Loading editor…</p>}
          />
        ) : (
          <p style={{ padding: "0.5rem" }}>Loading {title}…</p>
        )}
      </div>
      {/* ponytail: no test for this component — Monaco + electron ipcRenderer
          are host concerns; the page is smoke-tested manually. */}
    </div>
  );
});
