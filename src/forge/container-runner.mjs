import { createHash } from "node:crypto";
import { createReadStream, mkdtempSync, writeFileSync, chmodSync, rmSync, statSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const MAX_SANDBOX_PROMPT_CHARS = 12_000;
export const MAX_SANDBOX_TIMEOUT_MS = 180_000;
export const MAX_SANDBOX_OUTPUT_BYTES = 1_000_000;
export const MAX_GGUF_BYTES = 100 * 1024 * 1024 * 1024;
const DIGEST = /^[a-f0-9]{64}$/;
const IMAGE_REF = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/i;

export function validatePinnedImageRef(image) {
  return typeof image === "string" && image.length <= 300 && IMAGE_REF.test(image);
}

export function validateGgufDigest(value) {
  return typeof value === "string" && DIGEST.test(value);
}

export function buildSandboxEnvironment(source = process.env) {
  const env = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") env[key] = source[key];
  }
  return env;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function runDocker(spawn, args, timeout, env) {
  const result = spawn("docker", args, {
    encoding: "utf8", timeout, maxBuffer: MAX_SANDBOX_OUTPUT_BYTES,
    env, windowsHide: true, shell: false
  });
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") throw new Error("Isolated model run timed out; its output was not accepted.");
    throw new Error("Docker command failed to start: " + result.error.message);
  }
  if (result.status !== 0) throw new Error("Docker command failed with exit status " + result.status + ": " + String(result.stderr || "").slice(0, 500));
  return String(result.stdout || "");
}

/**
 * Execute a pinned GGUF model in an already-cached, digest-pinned llama.cpp image.
 * This runner never pulls images or model weights and never passes host secrets.
 * It is defense-in-depth, not a guarantee against all container/runtime escapes.
 */
export async function runIsolatedGguf({
  modelPath, expectedSha256, image, prompt, timeoutMs = 60_000,
  spawn = spawnSync, tempRoot = tmpdir()
}) {
  if (typeof modelPath !== "string" || !modelPath.trim()) throw new Error("An explicit local GGUF model path is required.");
  if (!validateGgufDigest(expectedSha256)) throw new Error("Expected model SHA-256 must be 64 lowercase hexadecimal characters.");
  if (!validatePinnedImageRef(image)) throw new Error("Container image must be pinned as repository@sha256:<64 lowercase hex characters>.");
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Prompt must not be empty.");
  if (prompt.length > MAX_SANDBOX_PROMPT_CHARS) throw new Error("Prompt exceeds the 12000 character limit.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_SANDBOX_TIMEOUT_MS) throw new Error("Timeout must be between 1000 and 180000 milliseconds.");

  const absoluteModelPath = realpathSync(resolve(modelPath));
  const stat = statSync(absoluteModelPath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_GGUF_BYTES || !basename(absoluteModelPath).toLowerCase().endsWith(".gguf")) {
    throw new Error("Model path must be a non-empty local .gguf file within the 100 GiB limit.");
  }
  const actualSha256 = await sha256File(absoluteModelPath);
  if (actualSha256 !== expectedSha256) throw new Error("Model SHA-256 mismatch; refusing to execute unverified weights.");

  const env = buildSandboxEnvironment();
  const inspectText = runDocker(spawn, ["image", "inspect", image], 5_000, env);
  let inspected;
  try { inspected = JSON.parse(inspectText); } catch { throw new Error("Docker image inspection returned invalid JSON."); }
  if (!Array.isArray(inspected) || inspected.length !== 1 || !Array.isArray(inspected[0]?.RepoDigests) || !inspected[0].RepoDigests.includes(image)) {
    throw new Error("The exact digest-pinned image is not present locally; this runner will not pull it.");
  }

  const tempDir = mkdtempSync(resolve(tempRoot, "jarvis-x-forge-"));
  const promptPath = resolve(tempDir, "prompt.txt");
  try {
    writeFileSync(promptPath, prompt, { encoding: "utf8", mode: 0o400, flag: "wx" });
    chmodSync(tempDir, 0o700);
    const args = [
      "run", "--pull=never", "--rm", "--network=none", "--read-only",
      "--memory=8g", "--cpus=4", "--pids-limit=128",
      "--security-opt=no-new-privileges", "--cap-drop=ALL", "--user=65534:65534",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
      "--mount", "type=bind,src=" + absoluteModelPath + ",dst=/input/model.gguf,readonly",
      "--mount", "type=bind,src=" + promptPath + ",dst=/input/prompt.txt,readonly",
      image, "-m", "/input/model.gguf", "-f", "/input/prompt.txt",
      "-n", "256", "--simple-io", "--no-display-prompt"
    ];
    const output = runDocker(spawn, args, timeoutMs, env).trim();
    if (!output) throw new Error("Isolated runtime returned no output.");
    return { output, modelSha256: actualSha256, image, runtime: "docker-llama.cpp", verified: false,
      controls: { network: "none", rootFilesystem: "read-only", modelMount: "read-only", promptMount: "read-only", secretsPassed: false, imagePull: "disabled", memoryLimit: "8g", cpuLimit: 4, pidsLimit: 128 } };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
