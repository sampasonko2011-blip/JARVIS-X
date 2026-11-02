// Deterministic integration fixture only. No network, environment, or model access.
export function createMockExecutionResult() {
  return {
    answer: [
      "JARVIS-X MOCK MODE — no real AI inference was performed.",
      "A deterministic placeholder was returned for integration testing only.",
      "No model API was contacted and no model credentials were read.",
      "This result does not demonstrate reasoning quality or live connectivity."
    ].join("\n\n"),
    executionReceipt: { mode: "mock-fixture", modelCalls: 0 },
    providerCalls: 0
  };
}
