import { performance } from "node:perf_hooks";

const capabilities = [
  { id: "reasoning-a", kind: "reasoning", strengths: ["planning", "reasoning"] },
  { id: "research-a", kind: "research", strengths: ["research", "current"] },
  { id: "coding-a", kind: "coding", strengths: ["coding", "implementation"] },
  { id: "critique-a", kind: "critique", strengths: ["critique", "verification"] }
];

const cases = [
  ["Create a plan for a complex reasoning problem", "reasoning"],
  ["Research current information", "research"],
  ["Implement a software feature", "coding"],
  ["Critique and verify a proposed solution", "critique"]
];

function baseline(kind) { return capabilities.find(c => c.kind === kind); }
function routed(objective, kind) {
  return capabilities.filter(c => c.kind === kind).sort((a,b) => {
    const score = c => c.strengths.some(s => objective.toLowerCase().includes(s)) ? 1 : 0;
    return score(b) - score(a);
  })[0];
}

const t0 = performance.now();
const baselineResults = cases.map(([objective, kind]) => ({objective, kind, selected: baseline(kind)}));
const t1 = performance.now();
const routedResults = cases.map(([objective, kind]) => ({objective, kind, selected: routed(objective, kind)}));
const t2 = performance.now();

const baselineAccuracy = baselineResults.filter(x => x.selected?.kind === x.kind).length / cases.length;
const routedAccuracy = routedResults.filter(x => x.selected?.kind === x.kind).length / cases.length;
const report = {
  benchmark: "JARVIS-X routing kernel v0.1",
  tasks: cases.length,
  baseline: { name: "direct capability lookup", accuracy: baselineAccuracy, latency_ms: +(t1-t0).toFixed(3) },
  jarvis_x: { name: "capability-aware routed selection", accuracy: routedAccuracy, latency_ms: +(t2-t1).toFixed(3) },
  gain: { accuracy_delta: +(routedAccuracy-baselineAccuracy).toFixed(3), latency_delta_ms: +(t2-t1-(t1-t0)).toFixed(3) },
  interpretation: "This validates routing mechanics only. It does not benchmark model intelligence because no external model provider is connected yet."
};
console.log(JSON.stringify(report, null, 2));
if (routedAccuracy < baselineAccuracy) process.exit(1);
