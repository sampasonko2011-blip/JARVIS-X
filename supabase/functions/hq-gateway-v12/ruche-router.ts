/**
 * JARVIS-X Universal Ruche Router.
 * Provider selection is server-side; credentials never enter the browser payload.
 * "composite" is one authenticated model call using a multi-perspective reasoning prompt.
 */
export type RucheProvider = "openai" | "deepseek" | "anthropic" | "xai" | "google" | "mistral" | "llama";
export type RucheSelection = "composite" | "openai" | "deepseek" | "claude" | "grok" | "gemini" | "mistral" | "llama";
export type RucheMode = "support" | "master_control";

export type RucheRoute = {
  selection: RucheSelection;
  provider: RucheProvider | null;
  mode: RucheMode;
  requiredSecrets: string[];
  needsLlamaEndpoint: boolean;
};

const ROUTES: Record<RucheSelection, { provider: RucheProvider | null; requiredSecrets: string[]; needsLlamaEndpoint: boolean }> = {
  composite: { provider: null, requiredSecrets: ["OPENAI_API_KEY"], needsLlamaEndpoint: false },
  openai: { provider: "openai", requiredSecrets: ["OPENAI_API_KEY"], needsLlamaEndpoint: false },
  deepseek: { provider: "deepseek", requiredSecrets: ["DEEPSEEK_API_KEY"], needsLlamaEndpoint: false },
  claude: { provider: "anthropic", requiredSecrets: ["ANTHROPIC_API_KEY"], needsLlamaEndpoint: false },
  grok: { provider: "xai", requiredSecrets: ["XAI_API_KEY"], needsLlamaEndpoint: false },
  gemini: { provider: "google", requiredSecrets: ["GEMINI_API_KEY"], needsLlamaEndpoint: false },
  mistral: { provider: "mistral", requiredSecrets: ["MISTRAL_API_KEY"], needsLlamaEndpoint: false },
  llama: { provider: "llama", requiredSecrets: ["LLAMA_API_KEY"], needsLlamaEndpoint: true },
};

export function resolveRucheRoute(selectionValue: unknown, modeValue: unknown):
  | { ok: true; route: RucheRoute }
  | { ok: false; error: string; allowed: string[] } {
  const selection = selectionValue === undefined || selectionValue === null || selectionValue === ""
    ? "composite"
    : selectionValue;
  let mode = modeValue === undefined || modeValue === null || modeValue === "" ? "support" : modeValue;
  if (mode === "epaulement") mode = "support";
  if (mode === "domination") mode = "master_control";
  if (mode === "live" || mode === "mock") mode = "support";
  if (typeof selection !== "string" || !Object.hasOwn(ROUTES, selection)) {
    return { ok: false, error: "invalid_ia_selection", allowed: Object.keys(ROUTES) };
  }
  if (mode !== "support" && mode !== "master_control") {
    return { ok: false, error: "invalid_orchestration_mode", allowed: ["support", "master_control", "epaulement", "domination"] };
  }
  const normalized = selection as RucheSelection;
  const spec = ROUTES[normalized];
  return { ok: true, route: { selection: normalized, provider: spec.provider, mode: mode as RucheMode, requiredSecrets: [...spec.requiredSecrets], needsLlamaEndpoint: spec.needsLlamaEndpoint } };
}
