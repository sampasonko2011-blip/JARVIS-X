// Deterministic mock only. This placeholder has no network or environment access; no model is called.
export function createMockCouncilResult() {
  return {
    answer: [
      "JARVIS-X MOCK MODE — no real AI inference was performed.",
      "A deterministic placeholder was returned for integration testing only.",
      "No provider API was contacted and no provider credentials were read.",
      "This result does not demonstrate model capability, reasoning quality, or provider connectivity.",
    ].join("\n\n"),
    providersUsed: [{ stage: "mock-placeholder", provider: "mock", model: "mock-v1" }],
    providerCalls: 0,
  };
}
