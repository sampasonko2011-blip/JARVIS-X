import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const providerKind = process.env.JARVIS_EVAL_PROVIDER ?? "local";
const baseUrl = process.env.ORBIT_BASE_URL ?? "http://127.0.0.1:11434/v1";
const apiKey = process.env.ORBIT_API_KEY ?? "ollama";
const model = process.env.ORBIT_MODEL ?? "llama3.2:3b";
const budgetUsd = Number(process.env.ORBIT_BUDGET_USD ?? "0.25");
const maxCalls = Number(process.env.ORBIT_MAX_CALLS ?? "40");
const maxTokens = Number(process.env.ORBIT_MAX_OUTPUT_TOKENS ?? "256");
const inputCostPerMillion = Number(process.env.ORBIT_INPUT_USD_PER_MILLION ?? "0");
const outputCostPerMillion = Number(process.env.ORBIT_OUTPUT_USD_PER_MILLION ?? "0");
const freeLocal = providerKind === "local";
const taskFile = process.env.ORBIT_EVAL_TASKS ?? "evaluation/tasks.json";
const reportPath = process.env.ORBIT_EVAL_REPORT ?? "orbit-evaluation-report.json";
const timeoutMs = Number(process.env.ORBIT_TIMEOUT_MS ?? "30000");

function fail(message) { console.error(message); process.exit(2); }
if (!["local", "orbit"].includes(providerKind)) fail("JARVIS_EVAL_PROVIDER must be local or orbit.");
if (!baseUrl || !apiKey || !model) fail("Provider URL, key and model must be non-empty.");
if (freeLocal && !["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname)) fail("Free local mode only permits localhost endpoints.");
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 5) fail("ORBIT_BUDGET_USD must be > 0 and <= $5.");
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 40) fail("ORBIT_MAX_CALLS must be an integer from 1 to 40.");
if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 512) fail("ORBIT_MAX_OUTPUT_TOKENS must be an integer from 1 to 512.");
if (![inputCostPerMillion, outputCostPerMillion].every(x => Number.isFinite(x) && x >= 0)) fail("Pricing inputs must be non-negative numbers.");
if (!freeLocal && (inputCostPerMillion === 0 || outputCostPerMillion === 0)) fail("Paid Orbit mode requires verified nonzero pricing rates.");
if (freeLocal && (inputCostPerMillion !== 0 || outputCostPerMillion !== 0)) fail("Local mode must use zero monetary rates.");
const endpoint = new URL(baseUrl.replace(/\/$/, "") + "/chat/completions");
if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) fail("ORBIT_BASE_URL must use HTTPS.");
const tasks = JSON.parse(await readFile(taskFile, "utf8"));
if (!Array.isArray(tasks) || tasks.length < 2) fail("Task file must contain at least two tasks.");
if (tasks.length * 2 > maxCalls) fail("Paired baseline/fusion calls exceed ORBIT_MAX_CALLS.");
const taskHash = createHash("sha256").update(JSON.stringify(tasks)).digest("hex");
const started = new Date().toISOString();
let spentEstimate = 0;
const results = [];

async function call(prompt, role) {
  if (results.length >= maxCalls) throw new Error("Call budget exhausted.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST", signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, max_tokens: maxTokens, messages: [
        { role: "system", content: role },
        { role: "user", content: prompt }
      ] })
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("Malformed/empty provider output.");
    const usage = data.usage ?? {};
    const inputTokens = Number(usage.prompt_tokens);
    const outputTokens = Number(usage.completion_tokens);
    if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) throw new Error("Provider did not return token usage; refusing to claim measured cost.");
    const cost = inputTokens * inputCostPerMillion / 1e6 + outputTokens * outputCostPerMillion / 1e6;
    if (!freeLocal && spentEstimate + cost > budgetUsd) throw new Error("Estimated spend ceiling reached; result discarded.");
    spentEstimate += cost;
    results.push({ role, latencyMs: null, inputTokens, outputTokens, estimatedCostUsd: cost, text });
    return { text, usage, cost };
  } finally { clearTimeout(timer); }
}

for (const task of tasks) {
  if (spentEstimate >= budgetUsd) throw new Error("Budget exhausted before paired task completed.");
  const baseline = await call(task.prompt, "Answer the task directly. Use only supplied evidence. State uncertainty and obey the requested output format.");
  const fusionPrompt = "Perform a synthesis pass: identify assumptions, check constraints, seek contradictions, and produce a concise answer grounded only in the supplied task and draft.\n\nTASK:\n" + task.prompt + "\n\nDRAFT TO AUDIT:\n" + baseline.text;
  const fusion = await call(fusionPrompt, "You are the independent synthesis and verification stage of JARVIS-X. Do not invent evidence. Explicitly correct unsupported claims.");
  results[results.length-2].latencyMs = baseline.usage?.total_time_ms ?? null;
  results[results.length-1].latencyMs = fusion.usage?.total_time_ms ?? null;
  console.log(`Completed paired task ${task.id ?? results.length / 2}`);
}
const report = {
  status: "OBSERVED_NOT_BLINDED_NOT_HOLDOUT",
  startedAt: started, finishedAt: new Date().toISOString(),
  providerMode: providerKind, provider: new URL(baseUrl).host, model, taskCount: tasks.length, taskSetSha256: taskHash,
  budgetUsd: freeLocal ? 0 : budgetUsd, estimatedSpendUsd: Number(spentEstimate.toFixed(6)),
  pricing: { inputUsdPerMillion: inputCostPerMillion, outputUsdPerMillion: outputCostPerMillion },
  results: results.map(({text,...safe}) => ({...safe, outputSha256:createHash("sha256").update(text).digest("hex"), output:text})),
  limitations: ["This script provides paired raw outputs, not a validated quality verdict.", "Blind scoring and independent holdout are required before claiming fusion superiority.", "The budget is a client-side estimate using user-supplied pricing; provider-side billing may differ.", "Local mode has no API usage charges but uses the user's hardware and electricity.", "The fusion condition is a sequential synthesis prompt, not proof that a multi-model ensemble is superior."]
};
await (await import("node:fs/promises")).writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", {mode:0o600});
console.log(`Wrote ${reportPath}; estimated cost $ ${spentEstimate.toFixed(4)}; task-set SHA-256 ${taskHash}`);
