import { Renderer } from "@freelensapp/extensions";
import { AiCliPage } from "./ai-cli-page";
import { EditorCommandHint, EditorCommandSetting, ProbeTimeoutHint, ProbeTimeoutSetting } from "./settings-page";

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

  appPreferences = [
    {
      id: "ai-cli-probe-timeout",
      title: "Freelens AI CLI",
      components: {
        Input: () => <ProbeTimeoutSetting />,
        Hint: () => <ProbeTimeoutHint />,
      },
    },
    {
      id: "ai-cli-editor-command",
      title: "Freelens AI CLI",
      components: {
        Input: () => <EditorCommandSetting />,
        Hint: () => <EditorCommandHint />,
      },
    },
  ];
}
