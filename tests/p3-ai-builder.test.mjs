import test from "node:test";
import assert from "node:assert/strict";
import {
  createToolArtifact, computeApprovalDigest, sealHumanApproval, verifyHumanApproval,
  authorizeToolActivation, inspectToolProposal, buildToolProposal
} from "../src/core/ai-builder.mjs";
import { validateToolSandboxRequest, runToolSandbox } from "../src/forge/tool-sandbox-runner.mjs";

const source = "export function add(a, b) { return a + b; }";
const tests = 'import test from "node:test"; import assert from "node:assert/strict"; import { add } from "./tool.mjs"; test("adds", () => assert.equal(add(2, 3), 5));';
const contract = { permissions: ["pure:compute", "input:json", "output:json"], budget: { timeoutMs: 5000, memoryMb: 128, spendEUR: 0 } };
const image = "node@sha256:" + "a".repeat(64);

test("proposal hash binds source, tests, contract and budget", () => {
  const a = createToolArtifact({ id: "add", source, tests, contract });
  const b = createToolArtifact({ id: "add", source: source + "\n", tests, contract });
  assert.match(a.artifactHash, /^[a-f0-9]{64}$/);
  assert.notEqual(a.artifactHash, b.artifactHash);
  assert.equal(computeApprovalDigest(a).length, 64);
});

test("static proposal review rejects dynamic execution, network, env and filesystem", () => {
  for (const code of ["eval(input)", "fetch('https://example.test')", "process.env.SECRET", "import fs from 'node:fs'"]) {
    assert.equal(inspectToolProposal(code).passed, false);
  }
  assert.equal(inspectToolProposal(source).passed, true);
});

test("L3 approval is bound to exact artifact and permission contract", () => {
  const artifact = createToolArtifact({ id: "add", source, tests, contract });
  const receipt = sealHumanApproval(artifact, {
    approved: true, digest: computeApprovalDigest(artifact), actor: "human-reviewer",
    confirmedAt: "2026-11-25T10:00:00.000Z"
  });
  assert.equal(verifyHumanApproval(artifact, receipt), true);
  assert.equal(authorizeToolActivation(artifact, receipt).status, "APPROVED_FOR_SEPARATELY_AUTHORIZED_ACTIVATION");
  const changed = createToolArtifact({ id: "add", source: source + "\n", tests, contract });
  assert.equal(verifyHumanApproval(changed, receipt), false);
  assert.throws(() => authorizeToolActivation(changed, receipt), /approval_missing/);
});

test("L3 approval rejects unbound or missing human confirmation", () => {
  const artifact = createToolArtifact({ id: "add", source, tests, contract });
  assert.throws(() => sealHumanApproval(artifact, { approved: true, digest: "0".repeat(64), actor: "x", confirmedAt: new Date().toISOString() }), /approval_invalid/);
  assert.throws(() => sealHumanApproval(artifact, { approved: false, digest: computeApprovalDigest(artifact), actor: "x", confirmedAt: new Date().toISOString() }), /approval_invalid/);
});

test("AI Builder requires Saboteur pass and successful sandbox controls", async () => {
  const common = { id: "add", source, tests, contract, sandboxImage: image };
  const rejected = await buildToolProposal({ ...common, saboteur: async () => ({ passed: false, findings: ["risk"] }), runSandbox: async () => { throw new Error("must not execute"); } });
  assert.equal(rejected.status, "REJECTED");
  const result = await buildToolProposal({
    ...common,
    saboteur: async () => ({ passed: true, findings: [] }),
    runSandbox: async () => ({ exitCode: 0, image, output: "tests passed", controls: {
      network: "none", rootFilesystem: "read-only", secretsPassed: false, imagePull: "disabled", capabilities: "dropped"
    } })
  });
  assert.equal(result.status, "AWAITING_L3_APPROVAL");
  assert.equal(result.artifactHash, result.artifact.artifactHash);
});

test("sandbox request rejects floating image tags, excessive budgets and invalid source", () => {
  assert.throws(() => validateToolSandboxRequest({ source, tests, image: "node:latest" }), /digest_pinned/);
  assert.throws(() => validateToolSandboxRequest({ source, tests, image, timeoutMs: 90_000 }), /timeout_invalid/);
  assert.throws(() => validateToolSandboxRequest({ source: "", tests, image }), /source_invalid/);
});

test("sandbox runner checks cached digest and executes without network, secrets or writeable root", async () => {
  const calls = [];
  const fakeSpawn = (_cmd, args, options) => {
    calls.push({ args, options });
    if (args[0] === "image") return { status: 0, stdout: JSON.stringify([{ RepoDigests: [image] }]), stderr: "" };
    return { status: 0, stdout: "tests 1 pass 1 fail 0", stderr: "" };
  };
  const result = await runToolSandbox({ source, tests, image }, { spawn: fakeSpawn });
  assert.equal(result.exitCode, 0);
  assert.equal(result.controls.network, "none");
  assert.equal(result.controls.secretsPassed, false);
  assert.equal(result.controls.imagePull, "disabled");
  assert.equal(result.controls.rootFilesystem, "read-only");
  assert.ok(calls[1].args.includes("--network=none"));
  assert.ok(calls[1].args.includes("--read-only"));
  assert.ok(calls[1].args.includes("--pull=never"));
  assert.equal(calls[1].options.shell, false);
  assert.equal("NODE_OPTIONS" in calls[1].options.env, false);
});

test("sandbox refuses a locally missing exact image digest", async () => {
  const fakeSpawn = () => ({ status: 0, stdout: JSON.stringify([{ RepoDigests: [] }]), stderr: "" });
  await assert.rejects(runToolSandbox({ source, tests, image }, { spawn: fakeSpawn }), /not_cached_exact_digest/);
});
