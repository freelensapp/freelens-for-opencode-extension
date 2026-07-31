import { Renderer } from "@freelensapp/extensions";
import { describe, expect, it, vi } from "vitest";

vi.mock("./agent-session-page", () => ({
  AgentSessionPage: () => null,
}));

import OpencodeRendererExtension from "./index";

describe("OpencodeRendererExtension sidebar registration", () => {
  it("registers the OpenCode menu item with the terminal icon", () => {
    const extension = new OpencodeRendererExtension({} as never);

    expect(extension.clusterPageMenus).toHaveLength(1);

    const [menu] = extension.clusterPageMenus;

    expect(menu).toMatchObject({
      id: "agent-session",
      title: "OpenCode",
      target: { pageId: "agent-session" },
    });

    const icon = menu.components.Icon({ className: "sidebar-icon" });

    expect(icon.type).toBe(Renderer.Component.Icon);
    expect(icon.props).toMatchObject({ className: "sidebar-icon", material: "terminal" });
  });
});
