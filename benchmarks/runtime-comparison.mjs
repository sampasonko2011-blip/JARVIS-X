import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { CapabilityRegistry } from "../dist/core/registry.js";
import { Orchestrator } from "../dist/core/orchestrator.js";

const ITERATIONS = Number.parseInt(process.env.JX_BENCH_ITERATIONS ?? "30", 10);
const WARMUP = Number.parseInt(process.env.JX_BENCH_WARMUP ?? "5", 10);
if (!Number.isInteger(ITERATIONS) || ITERATIONS < 1 || !Number.isInteger(WARMUP) || WARMUP < 0) {
  throw new Error("JX_BENCH_ITERATIONS must be >= 1 and JX_BENCH_WARMUP must be >= 0.");
}

const taskCases = [
  { id: "research-summary", objective: "summarize two verified facts", answer: "research summary", facts: ["source-A fact", "source-B fact"], sourceTrail: ["source-A", "source-B"], implementation: "summary module", testsIncluded: true },
  { id: "api-change", objective: "plan a tested API change", answer: "API change plan", facts: ["API contract", "error behavior"], sourceTrail: ["API spec", "error spec"], implementation: "API handler", testsIncluded: true },
  { id: "bug-investigation", objective: "produce a grounded bug fix", answer: "bug fix plan", facts: ["reproduction", "root cause"], sourceTrail: ["repro log", "code trace"], implementation: "guarded fix", testsIncluded: true },
  { id: "migration-plan", objective: "plan a safe data migration", answer: "migration plan", facts: ["schema change", "rollback condition"], sourceTrail: ["schema doc", "rollback runbook"], implementation: "migration script", testsIncluded: true },
].map(item => ({
  ...item,
  task: {
    id: item.id,
    objective: item.objective,
    constraints: ["use the supplied task fixture", "return one coherent deliverable"],
    inputs: {
      expectedAnswer: item.answer,
      requiredFacts: item.facts,
      expectedSourceTrail: item.sourceTrail,
      expectedImplementation: item.implementation,
      testsIncluded: item.testsIncluded,
      expectedOrganCount: 2,
    },
  },
}));

const requirements = [
  { capability: "research", weight: 1, required: true },
  { capability: "coding", weight: 1, required: true },
];
const candidates = [
  { providerId: "research-organ", capabilities: new Set(["research"]), evidence: [{ providerId: "research-organ", capability: "research", score: 9, status: "VALIDATED", sampleSize: 30 }] },
  { providerId: "coding-organ", capabilities: new Set(["coding"]), evidence: [{ providerId: "coding-organ", capability: "coding", score: 9, status: "VALIDATED", sampleSize: 30 }] },
];

function makeProvider(id, kind, outputFactory) {
  return {
    id,
    capabilities: [{ id: id + ":" + kind, kind, strengths: [kind] }],
    async execute(request) {
      return {
        capabilityId: id + ":" + kind,
        output: outputFactory(request),
        evidence: [{ source: id, claim: "deterministic fixture output", status: "OBSERVED" }],
      };
    },
  };
}

function createRuntimes() {
  const baselineRegistry = new CapabilityRegistry();
  baselineRegistry.register(makeProvider("baseline", "reasoning", request => {
    const input = request.task.inputs;
    return {
      answer: input.expectedAnswer,
      sources: input.requiredFacts,
      implementation: input.expectedImplementation,
      sourceTrail: input.expectedSourceTrail,
      testsIncluded: input.testsIncluded,
      organCount: input.expectedOrganCount,
    };
  }));
  const baseline = new Orchestrator(baselineRegistry);

  const compositeRegistry = new CapabilityRegistry();
  compositeRegistry.register(makeProvider("research-organ", "research", request => ({
    facts: request.task.inputs.requiredFacts,
    sourceTrail: request.task.inputs.expectedSourceTrail,
  })));
  compositeRegistry.register(makeProvider("coding-organ", "coding", request => ({
    implementation: request.task.inputs.expectedImplementation,
    testsIncluded: request.task.inputs.testsIncluded,
  })));
  compositeRegistry.register(makeProvider("synthesis-organ", "reasoning", request => {
    const organs = request.context.organOutputs ?? [];
    const research = organs.find(x => x.capabilityId === "research-organ:research")?.output;
    const coding = organs.find(x => x.capabilityId === "coding-organ:coding")?.output;
    return {
      answer: request.task.inputs.expectedAnswer,
      sources: research?.facts ?? [],
      sourceTrail: research?.sourceTrail ?? [],
      implementation: coding?.implementation ?? "",
      testsIncluded: coding?.testsIncluded === true,
      organCount: organs.length,
    };
  }));
  const composite = new Orchestrator(compositeRegistry);
  return { baseline, composite };
}

function checkDeliverable(output, taskCase) {
  const expected = taskCase.task.inputs;
  return output?.answer === expected.expectedAnswer &&
    JSON.stringify(output.sources) === JSON.stringify(expected.requiredFacts) &&
    output.implementation === expected.expectedImplementation &&
    JSON.stringify(output.sourceTrail) === JSON.stringify(expected.expectedSourceTrail) &&
    output.testsIncluded === expected.testsIncluded &&
    output.organCount === expected.expectedOrganCount;
}

async function measure(label, run, verifier) {
  for (let i = 0; i < WARMUP; i++) await run(taskCases[i % taskCases.length]);
  const samples = [];
  let passed = 0;
  let errors = 0;
  const perCase = Object.fromEntries(taskCases.map(taskCase => [taskCase.id, { attempts: 0, passed: 0, errors: 0 }]));

  for (let i = 0; i < ITERATIONS; i++) {
    const taskCase = taskCases[i % taskCases.length];
    perCase[taskCase.id].attempts++;
    const start = performance.now();
    try {
      const output = await run(taskCase);
      samples.push(performance.now() - start);
      if (verifier(output, taskCase)) {
        passed++;
        perCase[taskCase.id].passed++;
      }
    } catch {
      errors++;
      samples.push(null);
      perCase[taskCase.id].errors++;
    }
  }

  const validTimes = samples.filter(x => x !== null).sort((a, b) => a - b);
  const percentile = p => validTimes.length
    ? Number(validTimes[Math.min(validTimes.length - 1, Math.ceil(p * validTimes.length) - 1)].toFixed(3))
    : null;
  for (const entry of Object.values(perCase)) {
    entry.passRate = entry.attempts ? Number((entry.passed / entry.attempts).toFixed(4)) : null;
  }

  return {
    name: label,
    iterations: ITERATIONS,
    warmup: WARMUP,
    taskCaseCount: taskCases.length,
    passRate: Number((passed / ITERATIONS).toFixed(4)),
    errorRate: Number((errors / ITERATIONS).toFixed(4)),
    latencyMs: {
      median: percentile(0.5),
      p95: percentile(0.95),
      mean: validTimes.length ? Number((validTimes.reduce((a, b) => a + b, 0) / validTimes.length).toFixed(3)) : null,
    },
    failedChecks: ITERATIONS - passed - errors,
    perCase,
  };
}

const baselineRuntime = createRuntimes();
const baseline = await measure("single-organ-runtime", async taskCase => {
  const response = await baselineRuntime.baseline.run(taskCase.task, "reasoning", output => checkDeliverable(output, taskCase));
  return response.output;
}, checkDeliverable);

const compositeRuntime = createRuntimes();
const composite = await measure("multi-organ-synthesis-runtime", async taskCase => {
  const result = await compositeRuntime.composite.synthesizeFusion(
    taskCase.task,
    requirements,
    candidates,
    output => output != null,
    "synthesis-organ",
    output => checkDeliverable(output, taskCase),
  );
  return { output: result.synthesis.output, verification: result.verification };
}, (result, taskCase) => result?.verification === "VALIDATED" && checkDeliverable(result.output, taskCase));

const report = {
  benchmark: "JARVIS-X deterministic runtime comparison",
  version: 4,
  environment: {
    mode: "mock providers; no network; no paid model calls",
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    commitSha: process.env.GITHUB_SHA ?? null,
  },
  objective: "Compare local runtime overhead and contract compliance across multiple fixed task fixtures",
  taskCases: taskCases.map(({ id, objective, facts }) => ({ id, objective, factCount: facts.length })),
  limitations: [
    "This measures orchestration mechanics, not model intelligence or real-provider quality.",
    "The fixtures are deterministic and both providers and verifier are authored in this benchmark.",
    "The task cases improve contract coverage but are not an independent or blinded quality evaluation.",
    "Latency reflects local runtime overhead only; it is not a forecast of real API latency or cost.",
    "A passing fixture benchmark is a regression guard, not evidence that fusion improves task quality.",
  ],
  settings: { iterations: ITERATIONS, warmup: WARMUP, taskCaseCount: taskCases.length },
  results: [baseline, composite],
  deltas: {
    passRate: Number((composite.passRate - baseline.passRate).toFixed(4)),
    medianLatencyMs: baseline.latencyMs.median === null || composite.latencyMs.median === null
      ? null
      : Number((composite.latencyMs.median - baseline.latencyMs.median).toFixed(3)),
    p95LatencyMs: baseline.latencyMs.p95 === null || composite.latencyMs.p95 === null
      ? null
      : Number((composite.latencyMs.p95 - baseline.latencyMs.p95).toFixed(3)),
  },
};
const outputPath = process.env.JX_BENCH_OUTPUT ?? "benchmark-results.json";
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
console.log("Benchmark report written to " + outputPath);
if (baseline.passRate !== 1 || composite.passRate !== 1 || baseline.errorRate !== 0 || composite.errorRate !== 0) {
  process.exitCode = 1;
}
