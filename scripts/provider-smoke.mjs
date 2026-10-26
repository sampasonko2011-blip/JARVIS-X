/**
 * One bounded request per configured JARVIS-X provider for the manually dispatched workflow.
 * Never logs credentials. Uses a 20-second timeout (45 seconds for Gemini) and a 32-token output cap.
 * This is a smoke test, not a cost benchmark or proof of sustained reliability.
 */
const checks = [
  { provider: "OpenAI", envKey: "OPENAI_API_KEY", model: "gpt-6.1-sol", kind: "responses", url: "https://api.openai.com/v1/responses" },
  { provider: "DeepSeek", envKey: "DEEPSEEK_API_KEY", model: "deepseek-flash", kind: "chat", url: "https://api.deepseek.com/chat/completions" },
  { provider: "Anthropic", envKey: "ANTHROPIC_API_KEY", model: "claude-opus-5", kind: "anthropic", url: "https://api.anthropic.com/v1/messages" },
  { provider: "xAI", envKey: "XAI_API_KEY", model: "grok-4.7", kind: "responses", url: "https://api.x.ai/v1/responses" },
  { provider: "Google", envKey: "GOOGLE_API_KEY", model: "gemini-4-argon", kind: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent" }
];
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
  return (Array.isArray(payload?.candidates?.[0]?.content?.parts) ? payload.candidates[0].content.parts : [])
    .filter((part) => typeof part?.text === "string").map((part) => part.text).join("\n").trim();
}

function identityMatches(config, observed) {
  if (typeof observed !== "string" || !observed.trim()) return false;
  const id = observed.toLowerCase();
  if (config.provider === "OpenAI") return id.startsWith("gpt-6.1-sol");
  if (config.provider === "DeepSeek") return id === "deepseek-flash" || id.startsWith("deepseek-v4.1-flash");
  if (config.provider === "Anthropic") return id === "claude-opus-5" || id.startsWith("claude-opus-5-");
  if (config.provider === "xAI") return id.startsWith("grok-4.7");
  return id.startsWith("gemini-4-argon");
}

async function smokeTest(config) {
  const apiKey = process.env[config.envKey];
  if (!apiKey) return { provider: config.provider, requested_model_id: config.model, status: "MISSING_SECRET" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutFor(config));
  const started = Date.now();
  try {
    const headers = { "content-type": "application/json" };
    let body;
    if (config.kind === "responses") {
      headers.authorization = `Bearer ${apiKey}`;
      body = { model: config.model, instructions: "Answer the arithmetic question exactly with the integer only.", input: "Compute 17*19. Return only the integer.", max_output_tokens: 32 };
    } else if (config.kind === "chat") {
      headers.authorization = `Bearer ${apiKey}`;
      body = { model: config.model, messages: [{ role: "user", content: "Compute 17*19. Return only the integer." }], max_tokens: 32, stream: false };
    } else if (config.kind === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      body = { model: config.model, max_tokens: 32, messages: [{ role: "user", content: "Compute 17*19. Return only the integer." }] };
    } else {
      headers["x-goog-api-key"] = apiKey;
      body = { contents: [{ role: "user", parts: [{ text: "Compute 17*19. Return only the integer." }] }], generationConfig: { maxOutputTokens: 32_768, thinkingConfig: { thinkingLevel: "medium" } } };
    }
    const response = await fetch(config.url, {
      method: "POST", headers, body: JSON.stringify(body), signal: controller.signal
    });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const message = String(payload?.error?.message ?? payload?.message ?? "Provider returned a non-JSON error");
      return {
        provider: config.provider, requested_model_id: config.model, status: "HTTP_ERROR",
        http_status: response.status, latency_ms: Date.now() - started,
        error: message.split(apiKey).join("[REDACTED]").slice(0, 300)
      };
    }
    const text = extractText(config, payload);
    const observedModel = config.kind === "gemini" ? payload?.modelVersion : payload?.model;
    const modelMatch = identityMatches(config, observedModel);
    const arithmeticCheck = /(^|\D)323(\D|$)/.test(text);
    return {
      provider: config.provider, requested_model_id: config.model, observed_model_id: observedModel ?? null,
      exact_model_identity_verified: modelMatch,
      status: modelMatch && arithmeticCheck && text.length <= 12_000 ? "OBSERVED_PASS_SINGLE_SMOKE_TEST" : "OBSERVED_PARTIAL_OR_MISMATCH",
      arithmetic_check: arithmeticCheck, response_text: text.slice(0, 160),
      latency_ms: Date.now() - started, usage: payload?.usage ?? payload?.usageMetadata ?? null
    };
  } catch (error) {
    return {
      provider: config.provider, requested_model_id: config.model,
      status: error?.name === "AbortError" ? "TIMEOUT" : "REQUEST_ERROR",
      latency_ms: Date.now() - started,
      error: String(error?.message ?? error).split(apiKey).join("[REDACTED]").slice(0, 300)
    };
  } finally {
    clearTimeout(timeout);
  }
}

const results = [];
for (const config of checks) results.push(await smokeTest(config));
console.log(JSON.stringify({
  benchmark_id: "JX-PROVIDER-SMOKE-v2",
  checked_at: new Date().toISOString(),
  scope: "At most one bounded request per each of five providers; 32-token output cap; per-provider timeout; smoke test only, not ranking or a complete cost bound.",
  results
}, null, 2));
if (results.length !== 5 || results.some(item => item.status !== "OBSERVED_PASS_SINGLE_SMOKE_TEST")) process.exitCode = 1;
