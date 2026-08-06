import { Renderer } from "@freelensapp/extensions";
import { describe, expect, it, vi } from "vitest";

vi.mock("./ai-cli-page", () => ({
  AiCliPage: () => null,
}));

import AiCliRendererExtension from "./index";

describe("AiCliRendererExtension sidebar registration", () => {
  it("registers the Freelens AI CLI menu item with the terminal icon", () => {
    const extension = new AiCliRendererExtension({} as never);

    expect(extension.clusterPageMenus).toHaveLength(1);

    const [menu] = extension.clusterPageMenus;

    expect(menu).toMatchObject({
      id: "ai-cli",
      title: "Freelens AI CLI",
      target: { pageId: "ai-cli" },
    });

    const icon = menu.components.Icon({ className: "sidebar-icon" });

    expect(icon.type).toBe(Renderer.Component.Icon);
    expect(icon.props).toMatchObject({ className: "sidebar-icon", material: "terminal" });
  });
});
