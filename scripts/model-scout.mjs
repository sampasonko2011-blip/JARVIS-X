import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const fail = (message) => { console.error(message); process.exit(2); };
const candidateFile = process.env.JX_SCOUT_CANDIDATES ?? "evaluation/scout-candidates.local.json";
const taskFile = process.env.JX_SCOUT_TASKS ?? "evaluation/composite-benchmark.json";
const outputFile = process.env.JX_SCOUT_REPORT ?? "model-scout-report.json";
const mappingFile = process.env.JX_SCOUT_MAPPING ?? ".model-scout-mapping.json";
const maxCalls = Number(process.env.JX_SCOUT_MAX_CALLS ?? "15");
const maxTokens = Number(process.env.JX_SCOUT_MAX_OUTPUT_TOKENS ?? "160");
const timeoutMs = Number(process.env.JX_SCOUT_TIMEOUT_MS ?? "30000");
const freeOnly = process.env.JX_SCOUT_FREE_ONLY !== "0";
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 30) fail("JX_SCOUT_MAX_CALLS must be 1..30.");
if (!Number.isInteger(maxTokens) || maxTokens < 16 || maxTokens > 512) fail("JX_SCOUT_MAX_OUTPUT_TOKENS must be 16..512.");
if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) fail("JX_SCOUT_TIMEOUT_MS must be 1000..120000.");

let config, benchmark;
try {
  config = JSON.parse(await readFile(candidateFile, "utf8"));
  benchmark = JSON.parse(await readFile(taskFile, "utf8"));
} catch (error) {
  fail(`Cannot load candidate/task JSON: ${error.message}. See docs/model-scouting-and-composite-selection.md.`);
}
if (!Array.isArray(config.candidates) || !Array.isArray(benchmark.tasks)) fail("Candidate file needs candidates[] and task file needs tasks[].");
const candidates = config.candidates.filter(c => c.enabled === true);
if (!candidates.length) fail("No enabled candidates. Create a local candidate file; no endpoints are contacted by default.");
if (freeOnly && candidates.some(c => c.costClass !== "verified-zero-cost")) fail("Free-only run blocked: every enabled candidate must explicitly use costClass=verified-zero-cost.");
if (candidates.some(c => !c.id || !c.baseUrl || !c.model || !c.apiKeyEnv)) fail("Every candidate needs id, baseUrl, model, and apiKeyEnv (use an empty env var name only for local unauthenticated endpoints).");
if (candidates.length * benchmark.tasks.length > maxCalls) fail(`Call cap exceeded: ${candidates.length * benchmark.tasks.length} planned calls, max ${maxCalls}.`);

const seed = randomBytes(8).toString("hex");
const blindIds = new Map(candidates.map(c => [c.id, createHash("sha256").update(seed + c.id).digest("hex").slice(0, 10)]));
const results = [];
for (const candidate of candidates) {
  for (const task of benchmark.tasks) {
    const url = new URL(candidate.baseUrl.replace(/\/+$/, "") + (candidate.baseUrl.replace(/\/+$/, "").endsWith("/v1") ? "/chat/completions" : "/v1/chat/completions"));
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) fail(`Candidate ${candidate.id}: HTTPS required except loopback.`);
    const key = candidate.apiKeyEnv ? process.env[candidate.apiKeyEnv] : "";
    if (candidate.apiKeyEnv && !key) fail(`Candidate ${candidate.id}: required env var ${candidate.apiKeyEnv} is unset.`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = performance.now();
    let row = { blindId: blindIds.get(candidate.id), taskId: task.id, latencyMs: null, status: "error", output: "", error: "" };
    try {
      const headers = { "content-type": "application/json" };
      if (key) headers.authorization = `Bearer ${key}`;
      const response = await fetch(url, {
        method: "POST", headers, signal: controller.signal,
        body: JSON.stringify({ model: candidate.model, max_tokens: maxTokens, messages: [
          { role: "system", content: "Answer the task accurately. Do not claim to have performed actions you did not perform." },
          { role: "user", content: task.prompt }
        ] })
      });
      row.latencyMs = Math.round(performance.now() - start);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const output = payload.choices?.[0]?.message?.content;
      if (typeof output !== "string" || !output.trim()) throw new Error("No text content returned");
      row.status = "success";
      row.output = output;
      row.usage = payload.usage ?? null;
    } catch (error) {
      row.latencyMs = Math.round(performance.now() - start);
      row.error = controller.signal.aborted ? "timeout" : String(error.message ?? error);
    } finally {
      clearTimeout(timer);
    }
    results.push(row);
  }
}
const report = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  taskSetSha256: createHash("sha256").update(JSON.stringify(benchmark)).digest("hex"),
  candidateFileSha256: createHash("sha256").update(JSON.stringify(config)).digest("hex"),
  callCount: results.length,
  freeOnly,
  note: "Blinded raw outputs are not a model ranking. Verify actual upstream route, recurring price, terms, and fallback behavior independently. Score blindly using the benchmark rubric; do not put secrets or sensitive prompts in the benchmark.",
  blindScoring: { rubric: benchmark.scoring_rubric },
  results
};
await writeFile(outputFile, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(`Wrote ${outputFile}: ${results.filter(r => r.status === "success").length}/${results.length} requests succeeded. No quality winner is declared automatically.`);
