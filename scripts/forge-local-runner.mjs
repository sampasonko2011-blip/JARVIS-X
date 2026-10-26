#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseLocalRunnerArgs, runLocalOllama } from "../src/forge/local-ollama-runner.mjs";

const help = `JARVIS-X local Ollama smoke runner

Usage:
  node scripts/forge-local-runner.mjs --model <installed-model> [--timeout-ms 60000]

Read one prompt from stdin. This runner uses only a model already installed in local
Ollama; it never downloads weights. It passes no provider API keys to the child process.
This is a local inference smoke test, NOT a hardened sandbox. Do not feed it secrets or
treat model output as trusted code. Actual isolation requires a separate container/VM.
`;

try {
  const options = parseLocalRunnerArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help);
    process.exit(0);
  }
  const prompt = readFileSync(0, "utf8");
  const result = runLocalOllama({ ...options, prompt });
  process.stdout.write(JSON.stringify({
    status: "LOCAL_INFERENCE_COMPLETED_UNVERIFIED",
    model: result.model,
    runtime: result.runtime,
    verified: false,
    output: result.output
  }, null, 2) + "\n");
} catch (error) {
  process.stderr.write("JARVIS-X local runner: " + (error?.message || String(error)) + "\n");
  process.exitCode = 1;
}
