// Deterministic mock only. This module deliberately has no network or environment access.
const STAGES = Object.freeze([
  { stage: "lead_solver", provider: "mock", model: "mock-lead-v1" },
  { stage: "reasoning_review", provider: "mock", model: "mock-reasoner-v1" },
  { stage: "critical_review", provider: "mock", model: "mock-critic-v1" },
  { stage: "adversarial_review", provider: "mock", model: "mock-adversary-v1" },
  { stage: "final_synthesis", provider: "mock", model: "mock-synthesis-v1" },
]);

export function createMockCouncilResult() {
  return {
    answer: [
      "JARVIS-X MOCK MODE — no real AI inference was performed.",
      "Five council stages were simulated deterministically for integration testing.",
      "No provider API was contacted and no provider credentials were read.",
      "Replace this placeholder only after the authenticated, budget-guarded live path is explicitly approved.",
    ].join("\n\n"),
    providersUsed: STAGES.map((stage) => ({ ...stage })),
    providerCalls: 0,
  };
}
