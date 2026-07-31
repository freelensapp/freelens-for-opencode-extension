# OpenCode Sidebar Design

## Goal

Rename the extension sidebar item from `Agent Session` to `OpenCode` and give it a terminal icon.

## Scope

- Change the existing sidebar item's visible label to `OpenCode`.
- Supply the host-provided terminal (`>_`) icon in the same sidebar declaration.
- Preserve the item's identifier, route, terminal behavior, and saved sidebar state.

## Implementation

Update the renderer sidebar registration. Reuse the host extension API icon component or icon name; do not add an SVG asset or dependency.

## Validation

Update an existing registration test only if it asserts the label or icon. Run type checking, unit tests, build, and development package creation.
