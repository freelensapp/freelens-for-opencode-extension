import { Renderer } from "@freelensapp/extensions";
import { AgentSessionPage } from "./agent-session-page";

const {
  Component: { Icon },
} = Renderer;

function OpencodeIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} material="terminal" />;
}

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
      title: "OpenCode",
      target: { pageId: "agent-session" },
      components: { Icon: OpencodeIcon },
    },
  ];
}
