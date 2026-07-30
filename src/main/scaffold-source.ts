import path from "node:path";

// In production, electron-vite bundles main to out/main/index.js and the
// scaffold is copied to out/main/scaffold/ (see copyScaffold plugin in
// electron.vite.config.js). __dirname === out/main, so this resolves the
// bundled copy. In tests, __dirname === src/main, so it finds the source
// scaffold directly — same relative layout.
export function resolveScaffoldDir(explicit?: string): string {
  return explicit ?? path.join(__dirname, "scaffold");
}
