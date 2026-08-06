import { Renderer } from "@freelensapp/extensions";
import { AiCliPage } from "./ai-cli-page";

const {
  Component: { Icon },
} = Renderer;

function AiCliIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} material="terminal" />;
}

export default class AiCliRendererExtension extends Renderer.LensExtension {
  clusterPages = [
    {
      id: "ai-cli",
      components: { Page: () => <AiCliPage extension={this} /> },
    },
  ];

  clusterPageMenus = [
    {
      id: "ai-cli",
      title: "Freelens AI CLI",
      target: { pageId: "ai-cli" },
      components: { Icon: AiCliIcon },
    },
  ];
}
