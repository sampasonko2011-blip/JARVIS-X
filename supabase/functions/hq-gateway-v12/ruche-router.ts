/**
 * JARVIS-X Vegeto executive route.
 *
 * One coherent reasoning identity. The configured executive model is an
 * implementation detail; capabilities such as image generation are tools,
 * never alternate reasoning assistants or competing providers.
 */
export type RucheSelection = "composite";
export type RucheMode = "support" | "master_control";
export type RucheRoute = {
  selection: "composite";
  provider: null;
  mode: RucheMode;
  requiredSecrets: ["OPENAI_API_KEY"];
  needsLlamaEndpoint: false;
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
  if (selection !== "composite") {
    return { ok: false, error: "alternate_reasoning_routes_disabled", allowed: ["composite"] };
  }
  if (mode !== "support" && mode !== "master_control") {
    return { ok: false, error: "invalid_orchestration_mode", allowed: ["support", "master_control", "epaulement", "domination"] };
  }
  return {
    ok: true,
    route: {
      selection: "composite",
      provider: null,
      mode,
      requiredSecrets: ["OPENAI_API_KEY"],
      needsLlamaEndpoint: false,
    },
  };
}
