import { spawnSync } from "node:child_process";

export const MAX_PROMPT_CHARS = 12_000;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_TIMEOUT_MS = 180_000;
export const MAX_OUTPUT_BYTES = 1_000_000;

export function validateLocalModelName(name) {
  return typeof name === "string" &&
    name.length > 0 && name.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(name);
}

export function parseLocalRunnerArgs(args) {
  const parsed = { model: "", timeoutMs: DEFAULT_TIMEOUT_MS, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { parsed.help = true; continue; }
    if (arg === "--model") {
      if (!args[i + 1]) throw new Error("--model requires an installed model name");
      parsed.model = args[++i];
      continue;
    }
    if (arg === "--timeout-ms") {
      if (!args[i + 1]) throw new Error("--timeout-ms requires an integer");
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 1_000 || value > MAX_TIMEOUT_MS) {
        throw new Error("--timeout-ms must be an integer between 1000 and 180000");
      }
      parsed.timeoutMs = value;
      continue;
    }
    throw new Error("Unknown argument: " + arg);
  }
  if (!parsed.help && !validateLocalModelName(parsed.model)) {
    throw new Error("--model must be a valid local model identifier");
  }
  return parsed;
}

export function buildLocalRuntimeEnvironment(source = process.env) {
  const env = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") env[key] = source[key];
  }
  // Pin inference to the local Ollama daemon; do not pass provider credentials
  // or arbitrary parent-process environment variables to the child.
  env.OLLAMA_HOST = "127.0.0.1:11434";
  env.OLLAMA_NO_CLOUD = "1";
  return env;
}

export function parseInstalledModelNames(output) {
  return String(output).split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/)[0])
    .filter(name => validateLocalModelName(name));
}

export function runLocalOllama({ model, prompt, timeoutMs = DEFAULT_TIMEOUT_MS, spawn = spawnSync }) {
  if (!validateLocalModelName(model)) throw new Error("Invalid local model identifier");
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Prompt from stdin must not be empty");
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error("Prompt exceeds the " + MAX_PROMPT_CHARS + " character limit");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("Timeout is outside the allowed range");
  }
  const env = buildLocalRuntimeEnvironment();
  const listed = spawn("ollama", ["list"], {
    encoding: "utf8", timeout: 5_000, maxBuffer: 100_000, env, windowsHide: true
  });
  if (listed.error || listed.status !== 0) {
    throw new Error("Cannot query local Ollama. Install/start Ollama and verify it is available on 127.0.0.1:11434; this runner never downloads models.");
  }
  const installed = parseInstalledModelNames(listed.stdout);
  if (!installed.includes(model)) {
    throw new Error("Model is not installed locally: " + model + ". Pull/install it separately after reviewing the exact license and resource requirements; this runner will not download it.");
  }
  const result = spawn("ollama", ["run", model], {
    input: prompt,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    env,
    windowsHide: true
  });
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") throw new Error("Local inference timed out; no result accepted.");
    throw new Error("Local inference could not start: " + result.error.message);
  }
  if (result.status !== 0) throw new Error("Local inference failed with exit status " + result.status);
  const output = String(result.stdout || "").trim();
  if (!output) throw new Error("Local runtime returned no output.");
  return { model, output, runtime: "ollama-local-cli", verified: false };
}
