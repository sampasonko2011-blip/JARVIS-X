import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { buildSandboxEnvironment, runIsolatedGguf, validateGgufDigest, validatePinnedImageRef } from "../src/forge/container-runner.mjs";

test("container runner requires pinned image and model digest", () => {
  assert.equal(validatePinnedImageRef("ghcr.io/example/llama.cpp@sha256:" + "a".repeat(64)), true);
  assert.equal(validatePinnedImageRef("ghcr.io/example/llama.cpp:latest"), false);
  assert.equal(validateGgufDigest("b".repeat(64)), true);
  assert.equal(validateGgufDigest("not-a-digest"), false);
});

test("container environment drops API keys and arbitrary secrets", () => {
  const env = buildSandboxEnvironment({ PATH: "/bin", OPENAI_API_KEY: "never-pass", SECRET: "never-pass" });
  assert.equal(env.PATH, "/bin");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.SECRET, undefined);
});

test("container runner verifies local model digest and exact local image before execution", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "jx-runner-test-"));
  try {
    const modelPath = resolve(dir, "fixture.gguf");
    writeFileSync(modelPath, "test model weights");
    const digest = createHash("sha256").update("test model weights").digest("hex");
    const calls = [];
    const spawn = (_command, args) => {
      calls.push(args);
      if (args[0] === "image") return { status: 0, stdout: JSON.stringify([{ RepoDigests: ["ghcr.io/example/llama.cpp@sha256:" + "a".repeat(64)] }]), stderr: "" };
      return { status: 0, stdout: "local isolated output", stderr: "" };
    };
    const image = "ghcr.io/example/llama.cpp@sha256:" + "a".repeat(64);
    const result = await runIsolatedGguf({ modelPath, expectedSha256: digest, image, prompt: "hello", spawn, tempRoot: dir });
    assert.equal(result.output, "local isolated output");
    assert.equal(result.verified, false);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].includes("--network=none"));
    assert.ok(calls[1].includes("--read-only"));
    assert.ok(calls[1].includes("--pull=never"));
    assert.ok(calls[1].includes("--cap-drop=ALL"));
    assert.ok(calls[1].includes("--pids-limit=128"));
    assert.ok(calls[1].includes("type=bind,src=" + modelPath + ",dst=/input/model.gguf,readonly"));
    assert.equal(calls[1].includes("OPENAI_API_KEY"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("container runner rejects digest mismatch before Docker starts", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "jx-runner-test-"));
  try {
    const modelPath = resolve(dir, "fixture.gguf");
    writeFileSync(modelPath, "untrusted weights");
    let calls = 0;
    await assert.rejects(runIsolatedGguf({
      modelPath, expectedSha256: "a".repeat(64),
      image: "ghcr.io/example/llama.cpp@sha256:" + "b".repeat(64),
      prompt: "hello", spawn: () => { calls++; return { status: 0, stdout: "[]", stderr: "" }; }
    }), /SHA-256 mismatch/);
    assert.equal(calls, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
