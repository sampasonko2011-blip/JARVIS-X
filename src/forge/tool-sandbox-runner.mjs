import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const MAX_TOOL_SOURCE_CHARS = 100_000;
export const MAX_TOOL_TEST_CHARS = 100_000;
export const MAX_TOOL_TIMEOUT_MS = 30_000;
export const MAX_TOOL_OUTPUT_BYTES = 256_000;
const IMAGE_REF = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/i;
const sha256 = value => createHash("sha256").update(value, "utf8").digest("hex");

export function validateToolSandboxRequest({ source, tests, image, timeoutMs = 5_000, memoryMb = 256 }) {
  if (typeof source !== "string" || !source.trim() || source.length > MAX_TOOL_SOURCE_CHARS) throw new Error("tool_sandbox_source_invalid");
  if (typeof tests !== "string" || !tests.trim() || tests.length > MAX_TOOL_TEST_CHARS) throw new Error("tool_sandbox_tests_invalid");
  if (typeof image !== "string" || image.length > 300 || !IMAGE_REF.test(image)) throw new Error("tool_sandbox_image_must_be_digest_pinned");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TOOL_TIMEOUT_MS) throw new Error("tool_sandbox_timeout_invalid");
  if (!Number.isInteger(memoryMb) || memoryMb < 64 || memoryMb > 512) throw new Error("tool_sandbox_memory_invalid");
  return Object.freeze({ source, tests, image, timeoutMs, memoryMb,
    sourceSha256: sha256(source), testsSha256: sha256(tests) });
}
function run(spawn, args, timeoutMs, env) {
  const result = spawn("docker", args, { encoding: "utf8", timeout: timeoutMs,
    maxBuffer: MAX_TOOL_OUTPUT_BYTES, env, windowsHide: true, shell: false });
  if (result.error) throw new Error(result.error.code === "ETIMEDOUT" ? "tool_sandbox_timeout" : "tool_sandbox_docker_unavailable");
  if (result.status !== 0) return { exitCode: result.status ?? 1, output: String(result.stdout ?? "") + String(result.stderr ?? "") };
  return { exitCode: 0, output: String(result.stdout ?? "") };
}
export function buildToolSandboxEnvironment(source = process.env) {
  const env = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"]) if (typeof source[key] === "string") env[key] = source[key];
  return env;
}
/** Runs JS proposal tests in a locally cached, digest-pinned Node image with no network or host secrets. */
export async function runToolSandbox(request, { spawn = spawnSync, tempRoot = tmpdir() } = {}) {
  const checked = validateToolSandboxRequest(request);
  const env = buildToolSandboxEnvironment();
  const inspect = run(spawn, ["image", "inspect", checked.image], 5_000, env);
  if (inspect.exitCode !== 0) throw new Error("tool_sandbox_image_inspection_failed");
  let parsed;
  try { parsed = JSON.parse(inspect.output); } catch { throw new Error("tool_sandbox_image_inspection_invalid"); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.RepoDigests?.includes(checked.image)) {
    throw new Error("tool_sandbox_image_not_cached_exact_digest");
  }
  const dir = mkdtempSync(resolve(tempRoot, "jarvis-tool-sandbox-"));
  const sourcePath = resolve(dir, "tool.mjs");
  const testsPath = resolve(dir, "tool.test.mjs");
  try {
    writeFileSync(sourcePath, checked.source, { encoding: "utf8", mode: 0o444, flag: "wx" });
    writeFileSync(testsPath, checked.tests, { encoding: "utf8", mode: 0o444, flag: "wx" });
    chmodSync(dir, 0o555);
    const result = run(spawn, [
      "run", "--pull=never", "--rm", "--network=none", "--read-only",
      "--memory=" + checked.memoryMb + "m", "--cpus=1", "--pids-limit=32",
      "--security-opt=no-new-privileges", "--cap-drop=ALL", "--user=65534:65534",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
      "--mount", "type=bind,src=" + sourcePath + ",dst=/workspace/tool.mjs,readonly",
      "--mount", "type=bind,src=" + testsPath + ",dst=/workspace/tool.test.mjs,readonly",
      checked.image, "node", "--test", "/workspace/tool.test.mjs"
    ], checked.timeoutMs, env);
    return {
      exitCode: result.exitCode, output: result.output.slice(0, MAX_TOOL_OUTPUT_BYTES),
      image: checked.image, sourceSha256: checked.sourceSha256, testsSha256: checked.testsSha256,
      controls: { network: "none", rootFilesystem: "read-only", sourceMount: "read-only",
        testsMount: "read-only", secretsPassed: false, imagePull: "disabled", capabilities: "dropped",
        memoryMb: checked.memoryMb, cpuLimit: 1, pidsLimit: 32, user: "65534:65534" }
    };
  } finally {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  }
}
