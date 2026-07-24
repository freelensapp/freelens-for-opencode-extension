# freelens-opencode-extension — Testing

- Unit tests live next to the module: `<module>.test.ts`.
- Runner: `vitest run` (`pnpm test:unit`). Default env `node`; jsdom opt-in
  via `// @vitest-environment jsdom` per file (we have no component tests
  today — the page is thin shell over public APIs and is smoke-tested
  manually).
- Pure modules under `src/main/` accept injected `spawn`/`mkdir` deps so
  specs can stub them; no real subprocess or filesystem touched.
- `@freelensapp/extensions` is aliased to `test/freelens-extensions.ts` for
  any future component test; our current specs don't import it.