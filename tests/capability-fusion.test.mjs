import assert from "node:assert/strict";
import { buildFusionPlan } from "../dist/core/capability-fusion.js";

const plan = buildFusionPlan(
  [
    { capability: "dribbling", weight: 1 },
    { capability: "finishing", weight: 1 },
    { capability: "vision", weight: 1 },
  ],
  [
    {
      providerId: "perplexity",
      capabilities: new Set(["dribbling"]),
      evidence: [{ providerId: "perplexity", capability: "dribbling", score: 9.7, status: "VALIDATED", sampleSize: 30 }],
    },
    {
      providerId: "gpt",
      capabilities: new Set(["finishing"]),
      evidence: [{ providerId: "gpt", capability: "finishing", score: 9.8, status: "VALIDATED", sampleSize: 30 }],
    },
    {
      providerId: "claude",
      capabilities: new Set(["vision"]),
      evidence: [{ providerId: "claude", capability: "vision", score: 9.6, status: "VALIDATED", sampleSize: 30 }],
    },
  ],
);

assert.deepEqual(
  plan.selections.map((x) => [x.capability, x.providerId]),
  [["dribbling", "perplexity"], ["finishing", "gpt"], ["vision", "claude"]],
);
assert.equal(plan.unresolved.length, 0);

const forgedProvenance = buildFusionPlan(
  [{ capability: "research", weight: 1, required: true }],
  [{
    providerId: "candidate-a",
    capabilities: new Set(["research"]),
    evidence: [{
      providerId: "candidate-b",
      capability: "research",
      score: 100,
      status: "VALIDATED",
      sampleSize: 1000,
    }],
  }],
);
assert.equal(forgedProvenance.selections.length, 0);
assert.equal(forgedProvenance.unresolved.length, 1);

console.log("capability fusion tests passed");
