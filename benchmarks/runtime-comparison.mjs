import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { CapabilityRegistry } from "../dist/core/registry.js";
import { Orchestrator } from "../dist/core/orchestrator.js";

const ITERATIONS = Number.parseInt(process.env.JX_BENCH_ITERATIONS ?? "30", 10);
const WARMUP = Number.parseInt(process.env.JX_BENCH_WARMUP ?? "5", 10);
if (!Number.isInteger(ITERATIONS) || ITERATIONS < 1 || !Number.isInteger(WARMUP) || WARMUP < 0) {
  throw new Error("JX_BENCH_ITERATIONS must be >= 1 and JX_BENCH_WARMUP must be >= 0.");
}

const task = {
  id: "deterministic-benchmark",
  objective: "produce a grounded implementation plan",
  constraints: ["include a source trail", "return one coherent deliverable"],
  inputs: { requiredFacts: ["fact-a", "fact-b"], expectedOrganCount: 2 },
};
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
  baselineRegistry.register(makeProvider("baseline", "reasoning", () => ({
    answer: "grounded plan",
    sources: ["fact-a", "fact-b"],
    implementation: "fixture implementation",
    sourceTrail: ["fixture-source-a", "fixture-source-b"],
    testsIncluded: true,
    organCount: 2,
  })));
  const baseline = new Orchestrator(baselineRegistry);

  const compositeRegistry = new CapabilityRegistry();
  compositeRegistry.register(makeProvider("research-organ", "research", () => ({
    facts: ["fact-a", "fact-b"],
    sourceTrail: ["fixture-source-a", "fixture-source-b"],
  })));
  compositeRegistry.register(makeProvider("coding-organ", "coding", () => ({
    implementation: "fixture implementation",
    testsIncluded: true,
  })));
  compositeRegistry.register(makeProvider("synthesis-organ", "reasoning", request => {
    const organs = request.context.organOutputs ?? [];
    const research = organs.find(x => x.capabilityId === "research-organ:research")?.output;
    const coding = organs.find(x => x.capabilityId === "coding-organ:coding")?.output;
    return {
      answer: "grounded plan",
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

function checkDeliverable(output) {
  return output?.answer === "grounded plan" &&
    Array.isArray(output.sources) &&
    output.sources.length === 2 &&
    typeof output.implementation === "string" &&
    output.implementation.length > 0 &&
    output.testsIncluded === true &&
    output.organCount === 2 &&
    Array.isArray(output.sourceTrail) &&
    output.sourceTrail.length === 2;
}

async function measure(label, run, verifier) {
  for (let i = 0; i < WARMUP; i++) await run();
  const samples = [];
  let passed = 0;
  let errors = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    try {
      const output = await run();
      samples.push(performance.now() - start);
      if (verifier(output)) passed++;
    } catch {
      errors++;
      samples.push(null);
    }
  }
  const validTimes = samples.filter(x => x !== null).sort((a, b) => a - b);
  const percentile = p => validTimes.length
    ? Number(validTimes[Math.min(validTimes.length - 1, Math.ceil(p * validTimes.length) - 1)].toFixed(3))
    : null;
  return {
    name: label,
    iterations: ITERATIONS,
    warmup: WARMUP,
    passRate: Number((passed / ITERATIONS).toFixed(4)),
    errorRate: Number((errors / ITERATIONS).toFixed(4)),
    latencyMs: {
      median: percentile(0.5),
      p95: percentile(0.95),
      mean: validTimes.length ? Number((validTimes.reduce((a, b) => a + b, 0) / validTimes.length).toFixed(3)) : null,
    },
    failedChecks: ITERATIONS - passed - errors,
  };
}

const baselineRuntime = createRuntimes();
const baseline = await measure("single-organ-runtime", async () => {
  const response = await baselineRuntime.baseline.run(task, "reasoning", checkDeliverable);
  return response.output;
}, checkDeliverable);

const compositeRuntime = createRuntimes();
const composite = await measure("multi-organ-synthesis-runtime", async () => {
  const result = await compositeRuntime.composite.synthesizeFusion(
    task, requirements, candidates, output => output != null, "synthesis-organ", checkDeliverable,
  );
  return { output: result.synthesis.output, verification: result.verification };
}, result => result?.verification === "VALIDATED" && checkDeliverable(result.output));

const report = {
  benchmark: "JARVIS-X deterministic runtime comparison",
  version: 3,
  environment: {
    mode: "mock providers; no network; no paid model calls",
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    commitSha: process.env.GITHUB_SHA ?? null,
  },
  objective: "Compare runtime correctness and overhead on the same fixed task contract",
  limitations: [
    "This measures orchestration mechanics, not model intelligence or real-provider quality.",
    "The fixtures are deterministic and the verifier is authored alongside the fixtures.",
    "Latency reflects local runtime overhead only; it is not a forecast of real API latency or cost.",
    "A passing fixture benchmark is a regression guard, not evidence that fusion improves task quality.",
  ],
  settings: { iterations: ITERATIONS, warmup: WARMUP },
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
