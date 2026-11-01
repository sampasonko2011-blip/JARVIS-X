import { identityMatches, hasExpectedArithmeticResult } from "./provider-smoke-utils.mjs";

/**
 * Bounded, manually dispatched smoke test. All five API keys and exact model IDs
 * are preflighted before the first request. No model IDs are guessed.
 * One request per provider; maximum 32 output tokens per request.
 */
const checks = [
  { provider: "OpenAI", envKey: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", kind: "responses", url: "https://api.openai.com/v1/responses" },
  { provider: "DeepSeek", envKey: "DEEPSEEK_API_KEY", modelEnv: "DEEPSEEK_MODEL", kind: "chat", url: "https://api.deepseek.com/chat/completions" },
  { provider: "Anthropic", envKey: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", kind: "anthropic", url: "https://api.anthropic.com/v1/messages" },
  { provider: "xAI", envKey: "XAI_API_KEY", modelEnv: "XAI_MODEL", kind: "responses", url: "https://api.x.ai/v1/responses" },
  { provider: "Google", envKey: "GOOGLE_API_KEY", modelEnv: "GEMINI_MODEL", kind: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/interactions" }
];
const MAX_OUTPUT_TOKENS = 32;
const timeoutFor = (config) => config.kind === "gemini" ? 45_000 : 20_000;

function extractText(config, payload) {
  if (config.kind === "responses") {
    if (typeof payload?.output_text === "string") return payload.output_text.trim();
    return (Array.isArray(payload?.output) ? payload.output : [])
      .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .filter((part) => (part?.type === "output_text" || part?.type === "text") && typeof part?.text === "string")
      .map((part) => part.text).join("\n").trim();
  }
  if (config.kind === "chat") return String(payload?.choices?.[0]?.message?.content ?? "").trim();
  if (config.kind === "anthropic") return (Array.isArray(payload?.content) ? payload.content : [])
    .filter((part) => part?.type === "text" && typeof part?.text === "string").map((part) => part.text).join("\n").trim();
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  return (Array.isArray(payload?.steps) ? payload.steps : [])
    .filter((step) => step?.type === "model_output")
    .flatMap((step) => Array.isArray(step?.content) ? step.content : [])
    .filter((part) => part?.type === "text" && typeof part?.text === "string")
    .map((part) => part.text).join("\n").trim();
}

async function smokeTest(config, apiKey, model) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutFor(config));
  const started = Date.now();
  try {
    const headers = { "content-type": "application/json" };
    let body;
    if (config.kind === "responses") {
      headers.authorization = "Bearer " + apiKey;
      body = { model, instructions: "Answer with the integer only.", input: "Compute 17*19. Return only the integer.", max_output_tokens: MAX_OUTPUT_TOKENS };
    } else if (config.kind === "chat") {
      headers.authorization = "Bearer " + apiKey;
      body = { model, messages: [{ role: "user", content: "Compute 17*19. Return only the integer." }], max_tokens: MAX_OUTPUT_TOKENS, stream: false };
    } else if (config.kind === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      body = { model, max_tokens: MAX_OUTPUT_TOKENS, messages: [{ role: "user", content: "Compute 17*19. Return only the integer." }] };
    } else {
      headers["x-goog-api-key"] = apiKey;
      body = { model, input: "Compute 17*19. Return only the integer.", system_instruction: "Answer with the integer only.", generation_config: { max_output_tokens: MAX_OUTPUT_TOKENS, thinking_level: "medium" }, store: false };
    }
    const response = await fetch(config.url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const message = String(payload?.error?.message ?? payload?.message ?? "Provider returned a non-JSON error");
      return { provider: config.provider, requested_model_id: model, status: "HTTP_ERROR", http_status: response.status, latency_ms: Date.now() - started, error: message.split(apiKey).join("[REDACTED]").slice(0, 300) };
    }
    const output = extractText(config, payload);
    const observedModel = payload?.model;
    const modelMatch = identityMatches(observedModel, model);
    const arithmeticCheck = hasExpectedArithmeticResult(output);
    return { provider: config.provider, requested_model_id: model, observed_model_id: observedModel ?? null, exact_model_identity_verified: modelMatch, status: modelMatch && arithmeticCheck && output.length <= 12_000 ? "OBSERVED_PASS_SINGLE_SMOKE_TEST" : "OBSERVED_PARTIAL_OR_MISMATCH", arithmetic_check: arithmeticCheck, response_text: output.slice(0, 160), latency_ms: Date.now() - started, usage: payload?.usage ?? payload?.usageMetadata ?? null };
  } catch (error) {
    return { provider: config.provider, requested_model_id: model, status: error?.name === "AbortError" ? "TIMEOUT" : "REQUEST_ERROR", latency_ms: Date.now() - started, error: String(error?.message ?? error).split(apiKey).join("[REDACTED]").slice(0, 300) };
  } finally { clearTimeout(timeout); }
}

const missing = checks.flatMap(config => {
  const absent = [];
  if (!process.env[config.envKey]) absent.push(config.envKey);
  if (!process.env[config.modelEnv]) absent.push(config.modelEnv);
  return absent.length ? [{ provider: config.provider, missing: absent }] : [];
});
if (missing.length) {
  console.log(JSON.stringify({ benchmark_id: "JX-PROVIDER-SMOKE-v3", status: "PREFLIGHT_BLOCKED_NO_PROVIDER_CALLS", missing }, null, 2));
  process.exitCode = 1;
} else {
  const results = [];
  for (const config of checks) results.push(await smokeTest(config, process.env[config.envKey], process.env[config.modelEnv]));
  console.log(JSON.stringify({ benchmark_id: "JX-PROVIDER-SMOKE-v3", checked_at: new Date().toISOString(), scope: "At most one request per provider; 32-token output ceiling for every provider; all credentials and exact model IDs preflighted before any request. Smoke test only, not a complete cost bound.", results }, null, 2));
  if (results.length !== 5 || results.some(item => item.status !== "OBSERVED_PASS_SINGLE_SMOKE_TEST")) process.exitCode = 1;
}
