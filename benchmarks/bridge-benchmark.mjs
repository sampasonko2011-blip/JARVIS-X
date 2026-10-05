const cases = [
  { id: "single", mode: "single-organ" },
  { id: "critic", mode: "multi-organ-critique" },
  { id: "code", mode: "multi-organ-code-review" }
];

const baseline = cases.map(c => ({ ...c, selected: "gpt-only", success: true }));
const bridged = cases.map(c => ({ ...c, selected: c.mode === "single-organ" ? "gpt-only" : "gpt+claude-bridge", success: true }));

const score = rows => rows.filter(x => x.success).length / rows.length;

console.log(JSON.stringify({
  benchmark: "JX-ORG-BRIDGE-001-routing-simulation",
  cases: cases.length,
  baselineSuccess: score(baseline),
  bridgeSuccess: score(bridged),
  delta: score(bridged) - score(baseline),
  interpretation: "Routing-policy simulation only; it does not prove Claude improves intelligence. Real native-session execution is required."
}, null, 2));