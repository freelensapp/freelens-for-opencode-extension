import path from "node:path";
import { getAiCliProvider } from "../common/ai-cli-providers";

export function resolveScaffoldsRoot(explicit?: string): string {
  return explicit ?? path.join(__dirname, "scaffolds");
}

export function resolveProviderScaffold(providerId: string, explicitRoot?: string): string {
  return path.join(resolveScaffoldsRoot(explicitRoot), getAiCliProvider(providerId).id);
}
