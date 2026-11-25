import { createHash } from "node:crypto";
import { validateToolSandboxRequest, runToolSandbox } from "../forge/tool-sandbox-runner.mjs";

const MAX_SOURCE_CHARS = 100_000;
const MAX_TEST_CHARS = 100_000;
const FORBIDDEN_SOURCE = [
  /\b(?:eval|Function)\s*\(/,
  /\b(?:process\.env|Deno\.env|Bun\.env)\b/,
  /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/,
  /\b(?:child_process|node:child_process|node:net|node:tls|node:dgram)\b/,
  /\b(?:node:fs|node:fs\/promises|fs\.promises)\b/,
  /\b(?:require|import)\s*\(?\s*["'](?:https?:|data:|file:)/i
];

function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function requireBoundedString(value, name, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError("ai_builder_" + name + "_invalid");
}
function normalizeContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) throw new TypeError("ai_builder_contract_invalid");
  const permissions = [...new Set(contract.permissions ?? [])].sort();
  if (permissions.some(p => typeof p !== "string" || !/^[a-z][a-z0-9:._-]{0,63}$/.test(p))) throw new TypeError("ai_builder_permissions_invalid");
  if (permissions.some(p => !["pure:compute", "input:json", "output:json"].includes(p))) {
    throw new Error("ai_builder_permission_outside_sandbox_allowlist");
  }
  const inputs = contract.inputs ?? { contentType: "application/json", maxBytes: 16_384 };
  const outputs = contract.outputs ?? { contentType: "application/json", maxBytes: 16_384 };
  for (const [name, spec] of [["inputs", inputs], ["outputs", outputs]]) {
    if (!spec || spec.contentType !== "application/json" || !Number.isInteger(spec.maxBytes) || spec.maxBytes < 1 || spec.maxBytes > 65_536) {
      throw new TypeError("ai_builder_" + name + "_contract_invalid");
    }
  }
  const budget = contract.budget ?? { timeoutMs: 5_000, memoryMb: 256, spendEUR: 0 };
  if (!Number.isInteger(budget.timeoutMs) || budget.timeoutMs < 100 || budget.timeoutMs > 30_000 ||
      !Number.isInteger(budget.memoryMb) || budget.memoryMb < 64 || budget.memoryMb > 512 || budget.spendEUR !== 0) {
    throw new Error("ai_builder_budget_invalid_or_nonzero");
  }
  return { permissions, inputs, outputs, budget };
}
export function inspectToolProposal(source) {
  requireBoundedString(source, "source", MAX_SOURCE_CHARS);
  const findings = FORBIDDEN_SOURCE.filter(pattern => pattern.test(source)).map(() => "forbidden_capability_or_dynamic_execution_pattern");
  return { passed: findings.length === 0, findings };
}
export function createToolArtifact({ id, source, tests, contract }) {
  requireBoundedString(id, "id", 80);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new TypeError("ai_builder_id_invalid");
  requireBoundedString(source, "source", MAX_SOURCE_CHARS);
  requireBoundedString(tests, "tests", MAX_TEST_CHARS);
  const normalizedContract = normalizeContract(contract);
  const staticReview = inspectToolProposal(source);
  if (!staticReview.passed) throw new Error("ai_builder_static_review_rejected:" + staticReview.findings.join(","));
  const artifact = { schema: "jarvis.tool-artifact.v1", id, source, tests, contract: normalizedContract };
  const artifactHash = sha256(canonicalJson(artifact));
  return Object.freeze({ ...artifact, artifactHash });
}
export function computeArtifactHash(artifact) {
  if (!artifact || artifact.schema !== "jarvis.tool-artifact.v1") throw new TypeError("ai_builder_artifact_invalid");
  const { schema, id, source, tests, contract } = artifact;
  requireBoundedString(id, "id", 80);
  requireBoundedString(source, "source", MAX_SOURCE_CHARS);
  requireBoundedString(tests, "tests", MAX_TEST_CHARS);
  const normalizedContract = normalizeContract(contract);
  return sha256(canonicalJson({ schema, id, source, tests, contract: normalizedContract }));
}
export function computeApprovalDigest(artifact) {
  const { artifactHash, contract } = artifact ?? {};
  if (!/^[a-f0-9]{64}$/.test(artifactHash ?? "") || computeArtifactHash(artifact) !== artifactHash) {
    throw new TypeError("ai_builder_artifact_hash_invalid_or_mismatched");
  }
  return sha256(canonicalJson({ schema: "jarvis.tool-approval.v1", artifactHash, contract }));
}
/**
 * A trusted UI/authentication layer must produce the confirmation receipt.
 * This module checks its binding; it cannot prove who clicked a button.
 */
export function sealHumanApproval(artifact, confirmation) {
  const digest = computeApprovalDigest(artifact);
  if (!confirmation || confirmation.approved !== true || confirmation.digest !== digest ||
      typeof confirmation.actor !== "string" || !confirmation.actor.trim() ||
      typeof confirmation.confirmedAt !== "string" || !Number.isFinite(Date.parse(confirmation.confirmedAt))) {
    throw new Error("ai_builder_l3_approval_invalid");
  }
  return Object.freeze({
    schema: "jarvis.tool-approval-receipt.v1",
    artifactHash: artifact.artifactHash,
    approvalDigest: digest,
    actor: confirmation.actor.slice(0, 120),
    confirmedAt: confirmation.confirmedAt
  });
}
export function verifyHumanApproval(artifact, receipt) {
  try {
    return Boolean(receipt && receipt.schema === "jarvis.tool-approval-receipt.v1" &&
      receipt.artifactHash === artifact.artifactHash &&
      receipt.approvalDigest === computeApprovalDigest(artifact) &&
      typeof receipt.actor === "string" && receipt.actor.trim() &&
      Number.isFinite(Date.parse(receipt.confirmedAt)));
  } catch { return false; }
}
export async function buildToolProposal({ id, source, tests, contract, sandboxImage, runSandbox = runToolSandbox, saboteur }) {
  const artifact = createToolArtifact({ id, source, tests, contract });
  if (typeof saboteur !== "function") throw new TypeError("ai_builder_saboteur_required");
  const review = await saboteur(Object.freeze({ artifactHash: artifact.artifactHash, source, tests, contract: artifact.contract }));
  if (!review || review.passed !== true || !Array.isArray(review.findings)) {
    return { status: "REJECTED", artifactHash: artifact.artifactHash, findings: review?.findings ?? ["saboteur_review_invalid"] };
  }
  const sandboxRequest = validateToolSandboxRequest({
    source, tests, image: sandboxImage, timeoutMs: artifact.contract.budget.timeoutMs,
    memoryMb: artifact.contract.budget.memoryMb
  });
  const sandbox = await runSandbox(sandboxRequest);
  const sandboxPassed = sandbox?.exitCode === 0 && sandbox?.controls?.network === "none" &&
    sandbox.controls.rootFilesystem === "read-only" && sandbox.controls.secretsPassed === false &&
    sandbox.controls.imagePull === "disabled" && sandbox.controls.capabilities === "dropped";
  if (!sandboxPassed) return { status: "REJECTED", artifactHash: artifact.artifactHash,
    findings: ["sandbox_execution_or_attestation_failed"], sandbox: { exitCode: sandbox?.exitCode ?? null } };
  return {
    status: "AWAITING_L3_APPROVAL",
    artifact,
    artifactHash: artifact.artifactHash,
    approvalDigest: computeApprovalDigest(artifact),
    review: { status: "PASSED", findings: review.findings },
    sandbox: { status: "PASSED", image: sandbox.image, testSummary: String(sandbox.output ?? "").slice(0, 4_000),
      controls: sandbox.controls }
  };
}
export function authorizeToolActivation(artifact, receipt) {
  if (!verifyHumanApproval(artifact, receipt)) throw new Error("ai_builder_artifact_changed_or_l3_approval_missing");
  return { status: "APPROVED_FOR_SEPARATELY_AUTHORIZED_ACTIVATION", artifactHash: artifact.artifactHash,
    approvalDigest: receipt.approvalDigest, actor: receipt.actor, confirmedAt: receipt.confirmedAt };
}
