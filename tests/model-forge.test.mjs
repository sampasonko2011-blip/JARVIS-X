import test from "node:test";
import assert from "node:assert/strict";
import {
  validateModelCandidate,
  compareBenchmarkRuns,
  assessPromotion
} from "../src/forge/model-registry.mjs";

const candidate = {
  id: "example-small-open-model",
  displayName: "Example small open model",
  revision: "0123456789abcdef",
  sourceUrl: "https://huggingface.co/example/model",
  licenseId: "Apache-2.0-reviewed",
  artifactSha256: "a".repeat(64),
  capabilities: ["reasoning", "summarization"],
  baselineBenchmarkId: "baseline-001",
  candidateBenchmarkId: "candidate-001",
  securityReviewId: "security-001",
  networkAccess: false,
  secretsAccess: false,
  autoPromote: false
};

const baseline = { quality: 0.70, safety: 0.98, latencyMs: 900, memoryMb: 4000 };
const improved = { quality: 0.74, safety: 0.98, latencyMs: 850, memoryMb: 3800 };

test("accepts a candidate only when source, license, digest and isolation evidence exist", () => {
  assert.deepEqual(validateModelCandidate(candidate), { valid: true, errors: [] });
});

test("rejects untrusted source hosts, unknown licenses and non-isolated execution", () => {
  const result = validateModelCandidate({
    ...candidate,
    sourceUrl: "https://huggingface.co.evil.example/model",
    licenseId: "unknown",
    networkAccess: true
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(x => x.includes("allowlist")));
  assert.ok(result.errors.some(x => x.includes("licenseId")));
  assert.ok(result.errors.some(x => x.includes("networkAccess")));
});

test("rejects artifact digests that cannot pin the tested model", () => {
  const result = validateModelCandidate({ ...candidate, artifactSha256: "latest" });
  assert.ok(result.errors.some(x => x.includes("SHA-256")));
});

test("requires measurable quality gain and no safety, latency or memory regression", () => {
  assert.equal(compareBenchmarkRuns(baseline, improved).eligible, true);
  assert.equal(compareBenchmarkRuns(baseline, { ...improved, safety: 0.90 }).eligible, false);
  assert.equal(compareBenchmarkRuns(baseline, { ...improved, latencyMs: 1200 }).eligible, false);
});

test("never promotes automatically, even when benchmark gates pass", () => {
  assert.equal(assessPromotion(candidate, baseline, improved).status, "AWAITING_HUMAN_APPROVAL");
  assert.equal(
    assessPromotion(candidate, baseline, improved, { humanApproved: true, approver: "repository-owner" }).status,
    "ELIGIBLE_FOR_STAGED_RELEASE"
  );
});

test("missing benchmark metrics fail closed", () => {
  assert.equal(compareBenchmarkRuns(baseline, { quality: 0.9 }).eligible, false);
});
