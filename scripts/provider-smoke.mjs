/**
 * One-request-per-provider smoke test for the manually dispatched GitHub workflow.
 * Never logs credentials. Uses a 20-second timeout and a 32-token output cap.
 */
const timeoutMs = 20_000;
const checks = [
  {
    provider: "xAI",
    envKey: "XAI_API_KEY",
    url: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    model: "grok-4.7"
  },
  {
    provider: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    url: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: "deepseek-flash"
  }
];

async function smokeTest(config) {
  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    return { provider: config.provider, requested_model_id: config.model, status: "MISSING_SECRET" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${config.url.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "user", content: "Compute 17*19. Return only the integer." }
        ],
        temperature: 0,
        max_tokens: 32,
        stream: false
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { payload = {}; }

    if (!response.ok) {
      return {
        provider: config.provider,
        requested_model_id: config.model,
        status: "HTTP_ERROR",
        http_status: response.status,
        latency_ms: Date.now() - started,
        error: String(payload?.error?.message ?? payload?.message ?? "Provider returned a non-JSON error").slice(0, 400)
      };
    }

    const text = String(payload?.choices?.[0]?.message?.content ?? "").trim();
    const observedModel = payload?.model ?? null;
    const passed = text === "323" && observedModel === config.model;
    return {
      provider: config.provider,
      requested_model_id: config.model,
      observed_model_id: observedModel,
      exact_model_identity_verified: observedModel === config.model,
      status: passed ? "OBSERVED_PASS_SINGLE_SMOKE_TEST" : "OBSERVED_PARTIAL_OR_MISMATCH",
      arithmetic_check: text === "323",
      response_text: text.slice(0, 160),
      latency_ms: Date.now() - started,
      usage: payload?.usage ?? null
    };
  } catch (error) {
    return {
      provider: config.provider,
      requested_model_id: config.model,
      status: error?.name === "AbortError" ? "TIMEOUT" : "REQUEST_ERROR",
      latency_ms: Date.now() - started,
      error: String(error?.message ?? error).slice(0, 400)
    };
  } finally {
    clearTimeout(timeout);
  }
}

const results = [];
for (const config of checks) results.push(await smokeTest(config));
const report = {
  benchmark_id: "JX-PROVIDER-SMOKE-v1",
  checked_at: new Date().toISOString(),
  scope: "One request per provider; 32-token output cap; 20-second timeout; smoke test only, not model ranking.",
  results
};
console.log(JSON.stringify(report, null, 2));
if (results.some(item => item.status !== "OBSERVED_PASS_SINGLE_SMOKE_TEST")) process.exitCode = 1;
