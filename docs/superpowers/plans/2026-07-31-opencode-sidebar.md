# OpenCode Sidebar Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans implement plan task-by-task.

**Goal:** Rename the sidebar entry to `OpenCode` and display a terminal icon.

**Architecture:** Keep the route and declaration ID unchanged. Add one local icon component in the renderer entry that delegates to Freelens' existing `Icon` with Material icon `terminal`.

**Tech Stack:** TypeScript, React 17, `@freelensapp/extensions`, electron-vite, Vitest.

---

## File Map

- Modify: `src/renderer/index.tsx` — sidebar label and icon declaration.
- No test file — static declaration has no branch or behavior beyond extension SDK wiring; type checking and build validate it.

### Task 1: Update Sidebar Declaration

**Files:**

- Modify: `src/renderer/index.tsx:1-19`

- [ ] **Step 1: Add terminal icon component**

Import only `Renderer` as today. Destructure `Renderer.Component.Icon` and define a local component that forwards SDK `IconProps` and sets `material="terminal"`:

```tsx
const {
  Component: { Icon },
} = Renderer;

function OpencodeIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} material="terminal" />;
}
```

- [ ] **Step 2: Change sidebar declaration**

Keep `id: "agent-session"` and `target: { pageId: "agent-session" }`. Replace the title and empty component map:

```tsx
{
  id: "agent-session",
  title: "OpenCode",
  target: { pageId: "agent-session" },
  components: { Icon: OpencodeIcon },
}
```

- [ ] **Step 3: Format and type-check**

Run: `pnpm biome:check src/renderer/index.tsx && pnpm type:check`

Expected: both commands exit 0.

- [ ] **Step 4: Run unit tests**

Run: `pnpm test:unit`

Expected: all existing Vitest tests pass.

- [ ] **Step 5: Build and pack extension**

Run: `pnpm build && pnpm pack`

Expected: build completes and `pnpm pack` produces an installable `.tgz` file.

## Review

- Spec coverage: Task 1 changes visible label, uses a host-provided terminal icon, and preserves ID, route, terminal behavior, and saved state.
- Placeholder scan: none.
- Type consistency: `OpencodeIcon` uses `Renderer.Component.IconProps` and the existing SDK `Icon` component.
