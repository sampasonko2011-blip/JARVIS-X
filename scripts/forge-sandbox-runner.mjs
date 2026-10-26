#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runIsolatedGguf } from "../src/forge/container-runner.mjs";

function parseArgs(args) {
  const out = { modelPath: "", sha256: "", image: "", timeoutMs: 60_000, help: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--help" || key === "-h") { out.help = true; continue; }
    const values = { "--model-path": "modelPath", "--model-sha256": "sha256", "--image": "image", "--timeout-ms": "timeoutMs" };
    const target = values[key];
    if (!target) throw new Error("Unknown argument: " + key);
    if (!args[i + 1]) throw new Error(key + " requires a value");
    const value = args[++i];
    out[target] = target === "timeoutMs" ? Number(value) : value;
  }
  if (!out.help && (!out.modelPath || !out.sha256 || !out.image)) {
    throw new Error("--model-path, --model-sha256, and --image are required.");
  }
  return out;
}

const help = `JARVIS-X digest-pinned container runner

Usage:
  node scripts/forge-sandbox-runner.mjs --model-path /absolute/model.gguf --model-sha256 <sha256> --image <repo@sha256:digest> [--timeout-ms 60000]

Read one prompt from stdin. Requires Docker and a digest-pinned llama.cpp-compatible image
already present locally. It never pulls images or weights. Runs with no network, read-only
root/model/prompt mounts, capped CPU/RAM/PIDs, no added Linux capabilities and no host API
credentials passed to Docker. This is defense-in-depth, not a guarantee against container
escapes; review the image and runtime before use. Output is always marked unverified.
`;

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { process.stdout.write(help); return; }
    const prompt = readFileSync(0, "utf8");
    const result = await runIsolatedGguf({
      modelPath: options.modelPath, expectedSha256: options.sha256,
      image: options.image, timeoutMs: options.timeoutMs, prompt
    });
    process.stdout.write(JSON.stringify({
      status: "ISOLATED_CONTAINER_INFERENCE_COMPLETED_UNVERIFIED",
      ...result
    }, null, 2) + "\n");
  } catch (error) {
    process.stderr.write("JARVIS-X sandbox runner: " + (error?.message || String(error)) + "\n");
    process.exitCode = 1;
  }
}
await main();
