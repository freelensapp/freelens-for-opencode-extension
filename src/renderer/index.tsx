import { Renderer } from "@freelensapp/extensions";
import { AgentSessionPage } from "./agent-session-page";

export default class OpencodeRendererExtension extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "agent-session",
      components: { Page: () => <AgentSessionPage extension={this} /> },
    },
  ];

  clusterPageMenus = [
    {
      id: "agent-session",
      title: "Agent Session",
      target: { pageId: "agent-session" },
      components: {},
    },
  ];
}
