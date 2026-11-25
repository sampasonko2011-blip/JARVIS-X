import { runAgentFactory } from "../dist/core/agent-factory.js";
import { reviewResponse } from "../dist/core/behavioral-engine.js";
import { scoreBenchmark } from "../hq/p4-perception.mjs";

const CASES = [
  {
    id: "academic-grounded-summary",
    objective: "Produce a concise summary grounded in the supplied school support",
    domain: "academic",
    reference: "La photosynthèse utilise la lumière pour transformer eau et dioxyde de carbone en glucose et oxygène.",
    raw: "La photosynthèse utilise la lumière pour produire du glucose.",
    candidate: "La photosynthèse utilise la lumière pour transformer l’eau et le dioxyde de carbone en glucose et en oxygène."
  },
  {
    id: "academic-definition",
    objective: "Define a concept using only the supplied course support",
    domain: "academic",
    reference: "Une métaphore rapproche deux éléments sans outil de comparaison explicite.",
    raw: "Une métaphore est une comparaison.",
    candidate: "Une métaphore rapproche deux éléments sans utiliser explicitement un outil de comparaison."
  }
];

export async function runP4PipelineBenchmark() {
  const results = [];
  for (const item of CASES) {
    const root = { id: item.id, objective: item.objective, domain: "school", depth: 0, constraints: ["offline_fixture_only", "estimated_spend=0 EUR"] };
    const pipeline = await runAgentFactory(root, {
      decompose: () => [],
      execute: async () => ({ agentId: "DeterministicFixtureAgent", content: item.candidate, evidence: [{ claim: "fixture response", status: "OBSERVED" }] }),
      saboteur: (_task, output) => {
        const review = reviewResponse(output.content, item.domain);
        return { passed: review.accepted, findings: review.issues };
      },
      synthesize: (_task, accepted) => accepted.map(output => output.content).join("\n")
    });
    const comparison = scoreBenchmark({ reference: item.reference, raw: item.raw, pipeline: pipeline.output, mode: "fixture-simulated" });
    results.push({
      caseId: item.id,
      pipelineStatus: pipeline.status,
      saboteur: pipeline.status === "VALIDATED" ? "PASSED" : pipeline.status,
      behavioralEngine: "INVOKED",
      agentFactory: "INVOKED",
      rawQwen: { status: "FIXTURE_NOT_REAL_QWEN", ...comparison.raw },
      pipelineOutput: { status: "DETERMINISTIC_FIXTURE_NOT_MODEL_EXECUTION", ...comparison.pipeline },
      comparison: { metric: "lexical-overlap-only", note: "Not a correctness, reasoning, or hallucination score." },
      estimatedSpendEUR: pipeline.estimatedSpendEUR
    });
  }
  return {
    schema: "jx.p4.pipeline-benchmark.v1",
    mode: "DETERMINISTIC_PIPELINE_FIXTURE",
    realModelCalls: 0,
    qwenRuntimeInvoked: false,
    cases: results
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runP4PipelineBenchmark();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
