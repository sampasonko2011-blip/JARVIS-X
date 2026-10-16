const DEFAULT_TIMEOUT_MS = 45000;

function cleanBaseUrl(value, fallback) {
  return String(value || fallback).replace(/\/+$/, "");
}

function extractText(provider, payload) {
  if (provider === "ollama") {
    return typeof payload?.message?.content === "string" ? payload.message.content.trim() : "";
  }
  if (provider === "google") {
    return (payload?.candidates?.[0]?.content?.parts ?? [])
      .filter(part => part?.thought !== true && typeof part?.text === "string")
      .map(part => part.text)
      .filter(Boolean).join("\n").trim();
  }
  if (provider === "anthropic") {
    return (payload?.content ?? [])
      .filter(item => item?.type === "text" && typeof item.text === "string")
      .map(item => item.text).join("\n").trim();
  }
  return typeof payload?.choices?.[0]?.message?.content === "string"
    ? payload.choices[0].message.content.trim() : "";
}

function errorMessage(payload, status) {
  return String(payload?.error?.message ?? payload?.message ?? payload?.error ?? `HTTP ${status}`).slice(0, 800);
}

async function postJson({ provider, url, headers, body, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { payload = { message: raw.slice(0, 800) }; }
    if (!response.ok) {
      const error = new Error(`${provider} request failed (${response.status}): ${errorMessage(payload, response.status)}`);
      error.status = response.status;
      error.provider = provider;
      throw error;
    }
    const text = extractText(provider, payload);
    if (!text) {
      const error = new Error(`${provider} returned no text content`);
      error.provider = provider;
      error.status = response.status;
      throw error;
    }
    return {
      text,
      latency_ms: Date.now() - started,
      provider,
      observed_model_id: provider === "google" ? payload?.modelVersion ?? null : payload?.model ?? null,
      raw_usage: payload?.usage ?? payload?.usageMetadata ?? (provider === "ollama" ? {
        prompt_eval_count: payload?.prompt_eval_count ?? null,
        eval_count: payload?.eval_count ?? null,
        total_duration: payload?.total_duration ?? null,
        load_duration: payload?.load_duration ?? null
      } : null)
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`${provider} request timed out after ${timeoutMs}ms`);
      timeoutError.code = "PROVIDER_TIMEOUT";
      timeoutError.provider = provider;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Construct adapters for credentialed hosted providers and explicitly registered local Ollama models.
 * Credentials are never read from files or returned to callers.
 *
 * Supported environment variables:
 * GEMINI_API_KEY or GOOGLE_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY,
 * OPENAI_API_KEY, MISTRAL_API_KEY, GROQ_API_KEY, XAI_API_KEY, QWEN_API_KEY.
 * Optional base URLs: OPENAI_BASE_URL, MISTRAL_BASE_URL, GROQ_BASE_URL, XAI_BASE_URL, QWEN_BASE_URL.
 */
export function createProviderAdapters({
  registry,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  excludedProviders = ["openrouter"]
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError("timeoutMs must be a positive integer");

  const credentials = {
    google: env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    deepseek: env.DEEPSEEK_API_KEY,
    openai: env.OPENAI_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    groq: env.GROQ_API_KEY,
    xai: env.XAI_API_KEY,
    qwen: env.QWEN_API_KEY
  };
  const excluded = new Set(["openrouter", ...excludedProviders.map(value => String(value).trim().toLowerCase())]);
  const configured = Object.keys(credentials).filter(key => Boolean(credentials[key]) && !excluded.has(key));
  const ollamaCandidates = (registry?.candidates ?? []).filter(candidate =>
    String(candidate?.provider ?? "").trim().toLowerCase() === "ollama" &&
    typeof candidate?.model_id === "string" && candidate.model_id.trim() &&
    candidate.status !== "SUPERSEDED"
  );
  if (ollamaCandidates.length && !excluded.has("ollama")) configured.push("ollama");
  const adapters = {};

  const textModelKinds = new Set(["hosted-model", "hosted-model-candidate", "open-weight-model-candidate", "open-weight-coding-candidate", "model-family-candidate", "open-weight-model-family", "local-runtime"]);
  for (const candidate of registry?.candidates ?? []) {
    if (!candidate?.id || !candidate?.model_id || candidate.status === "SUPERSEDED") continue;
    const candidateProvider = String(candidate.provider ?? "").trim().toLowerCase();
    if (excluded.has(candidateProvider)) continue;
    if (candidate.kind && !textModelKinds.has(candidate.kind)) continue;
    const provider = String(candidate.provider ?? "").trim().toLowerCase();
    let adapter;

    if ((provider === "google" || provider === "gemini") && credentials.google) {
      adapter = async ({ task, role }) => postJson({
        provider: "google",
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate.model_id)}:generateContent`,
        headers: { "x-goog-api-key": credentials.google },
        body: {
          systemInstruction: { parts: [{ text: `You are a specialist in the ${role} role. Be accurate, distinguish evidence from assumptions, and state uncertainty.` }] },
          contents: [{ role: "user", parts: [{ text: task }] }],
          generationConfig: { temperature: 0 }
        },
        fetchImpl, timeoutMs
      });
    } else if (provider === "ollama" && !excluded.has("ollama")) {
      const baseUrl = cleanBaseUrl(env.OLLAMA_BASE_URL, "http://127.0.0.1:11434");
      adapter = async ({ task, role }) => postJson({
        provider: "ollama",
        url: `${baseUrl}/api/chat`,
        headers: {},
        body: {
          model: candidate.model_id,
          messages: [
            { role: "system", content: `You are a specialist in the ${role} role. Be accurate, distinguish evidence from assumptions, and state uncertainty.` },
            { role: "user", content: task }
          ],
          stream: false,
          options: { temperature: 0 }
        },
        fetchImpl, timeoutMs
      });
    } else if (provider === "anthropic" && credentials.anthropic) {
      adapter = async ({ task, role }) => postJson({
        provider: "anthropic",
        url: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": credentials.anthropic, "anthropic-version": "2023-06-01" },
        body: {
          model: candidate.model_id,
          max_tokens: 4096,
          system: `You are a specialist in the ${role} role. Be accurate, distinguish evidence from assumptions, and state uncertainty.`,
          messages: [{ role: "user", content: task }]
        },
        fetchImpl, timeoutMs
      });
    } else {
      const compatible = {
        deepseek: { key: credentials.deepseek, base: "https://api.deepseek.com", baseEnv: null },
        openai: { key: credentials.openai, base: "https://api.openai.com/v1", baseEnv: "OPENAI_BASE_URL" },
        "mistral ai": { key: credentials.mistral, base: "https://api.mistral.ai/v1", baseEnv: "MISTRAL_BASE_URL" },
        groq: { key: credentials.groq, base: "https://api.groq.com/openai/v1", baseEnv: "GROQ_BASE_URL" },
        xai: { key: credentials.xai, base: "https://api.x.ai/v1", baseEnv: "XAI_BASE_URL" },
        "alibaba qwen": { key: credentials.qwen, base: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", baseEnv: "QWEN_BASE_URL" }
      };
      const config = compatible[provider];
      if (config?.key) {
        adapter = async ({ task, role }) => postJson({
          provider,
          url: `${cleanBaseUrl(config.baseEnv ? env[config.baseEnv] : null, config.base)}/chat/completions`,
          headers: { authorization: `Bearer ${config.key}` },
          body: {
            model: candidate.model_id,
            messages: [
              { role: "system", content: `You are a specialist in the ${role} role. Be accurate, distinguish evidence from assumptions, and state uncertainty.` },
              { role: "user", content: task }
            ],
            temperature: 0
          },
          fetchImpl, timeoutMs
        });
      }
    }

    if (adapter) {
      adapters[candidate.id] = async ({ task, role = "general-reasoning" }) => {
        if (typeof task !== "string" || !task.trim()) throw new TypeError("task must be a non-empty string");
        const result = await adapter({ task, role });
        return {
          text: result.text,
          latency_ms: result.latency_ms,
          provider: result.provider,
          requested_model_id: candidate.model_id,
          observed_model_id: result.observed_model_id,
          raw_usage: result.raw_usage
        };
      };
    }
  }

  return {
    adapters,
    configured_providers: configured,
    note: "Credential presence enables adapter construction; it does not prove credentials are valid, routes are reachable, or models are benchmark-validated."
  };
}
