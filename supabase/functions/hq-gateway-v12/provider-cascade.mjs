// Closed source-controlled provider/model allowlist. Provider account billing tier is
// external state and cannot be proven by this adapter; live inference remains separately
// fail-closed behind LIVE_INFERENCE_ENABLED, consent, auth, rate-limit and budget gates.
const PROVIDERS = Object.freeze([
  {
    id: "gemini",
    secret: "GEMINI_API_KEY",
    enabled: "JX_PROVIDER_GEMINI_ENABLED",
    model: "JX_GEMINI_MODEL",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    allowedModel: "gemini-2.5-flash",
  },
  {
    id: "groq",
    secret: "GROQ_API_KEY",
    enabled: "JX_PROVIDER_GROQ_ENABLED",
    model: "JX_GROQ_MODEL",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    allowedModel: "llama-3.3-70b-versatile",
  },
]);
const ALLOWED_MODELS = Object.freeze({
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
});

const MAX_MESSAGES = 64;
const MAX_INPUT_CHARS = 64_000;
const MAX_OUTPUT_CHARS = 12_000;
const MAX_TOOL_DEFINITIONS = 16;
const RETRYABLE_STATUS = new Set([402, 429]);

function fail(code) {
  throw new TypeError(code);
}

function safeText(value, max = MAX_INPUT_CHARS) {
  if (typeof value !== "string" || value.length > max) fail("provider_input_invalid");
  return value;
}

function extractContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part?.text === "string") return part.text;
    if (typeof part?.content === "string") return part.content;
    return "";
  }).filter(Boolean).join("\n");
}

function toChatMessages(input) {
  const items = typeof input === "string" ? [{ role: "user", content: input }] : input;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_MESSAGES) fail("provider_input_invalid");
  const messages = [];
  for (const item of items) {
    if (item && ["system", "developer", "user", "assistant"].includes(item.role)) {
      const content = extractContent(item.content);
      if (content) messages.push({ role: item.role, content });
      continue;
    }
    if (item?.type === "message" && ["system", "developer", "user", "assistant"].includes(item.role)) {
      const content = extractContent(item.content);
      if (content) messages.push({ role: item.role, content });
      continue;
    }
    if (item?.type === "function_call") {
      const previous = messages[messages.length - 1];
      const call = {
        id: safeText(item.call_id, 200),
        type: "function",
        function: {
          name: safeText(item.name, 200),
          arguments: safeText(item.arguments, 16_000),
        },
      };
      if (previous?.role === "assistant") previous.tool_calls = [...(previous.tool_calls ?? []), call];
      else messages.push({ role: "assistant", content: null, tool_calls: [call] });
      continue;
    }
    if (item?.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: safeText(item.call_id, 200),
        content: safeText(item.output, 20_000),
      });
    }
  }
  if (!messages.length) fail("provider_input_empty");
  const serialized = JSON.stringify(messages);
  if (serialized.length > MAX_INPUT_CHARS) fail("provider_input_too_large");
  return messages;
}

function toChatTools(tools) {
  if (!Array.isArray(tools) || tools.length > MAX_TOOL_DEFINITIONS) fail("provider_tools_invalid");
  return tools.map((tool) => {
    if (tool?.type !== "function" || typeof tool.name !== "string" || !tool.name.trim()) fail("provider_tool_invalid");
    return {
      type: "function",
      function: {
        name: tool.name,
        description: typeof tool.description === "string" ? tool.description : "",
        parameters: tool.parameters && typeof tool.parameters === "object" ? tool.parameters : { type: "object", properties: {} },
      },
    };
  });
}

function normalizeResponse(data, providerId, configuredModel) {
  const choice = data?.choices?.[0];
  const message = choice?.message;
  if (!message || typeof message !== "object") fail("provider_empty_output_" + providerId);
  const output = [];
  const content = extractContent(message.content);
  if (content) output.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: content }] });
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    if (call?.type !== "function" || typeof call.id !== "string" ||
        typeof call.function?.name !== "string" || typeof call.function?.arguments !== "string") {
      fail("provider_tool_response_invalid_" + providerId);
    }
    output.push({
      type: "function_call",
      call_id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    });
  }
  const outputText = content.slice(0, MAX_OUTPUT_CHARS);
  if (!output.length || (outputText.length === 0 && !output.some((item) => item.type === "function_call"))) {
    fail("provider_empty_output_" + providerId);
  }
  const returnedModel = typeof data.model === "string" && data.model.trim() ? data.model : configuredModel;
  if (returnedModel !== configuredModel || ALLOWED_MODELS[providerId] !== configuredModel) {
    fail("provider_model_not_allowlisted_" + providerId);
  }
  return {
    id: typeof data.id === "string" ? data.id : "provider-response",
    status: "completed",
    model: providerId + "/" + returnedModel,
    output,
    output_text: outputText,
  };
}

function configuredProviders(env) {
  if (env.JX_ENABLE_PROVIDER_CASCADE !== "true") return [];
  return PROVIDERS.filter((provider) => {
    const enabled = env[provider.enabled] === "true";
    const apiKey = env[provider.secret];
    const configuredModel = env[provider.model];
    const modelAllowed = configuredModel === undefined || configuredModel === provider.allowedModel;
    return enabled && modelAllowed && typeof apiKey === "string" && apiKey.trim().length > 0;
  }).map((provider) => ({
    ...provider,
    apiKey: env[provider.secret],
    modelId: provider.allowedModel,
  }));
}

/**
 * One executive adapter with a deterministic provider order.
 * Only explicit provider enable flags + a global cascade flag permit routing.
 * Automatic failover is limited to HTTP 402/429, which indicate that the
 * request was rejected before a successful inference response.
 */
export async function invokeProviderCascade(options = {}) {
  const { input, instructions, tools = [], env = {}, fetchImpl = fetch, timeoutMs = 25_000 } = options;
  const providers = configuredProviders(env);
  if (!providers.length) throw new Error("provider_cascade_not_configured");
  const messages = toChatMessages(input);
  if (typeof instructions === "string" && instructions.trim()) {
    messages.unshift({ role: "system", content: safeText(instructions, 12_000) });
  }
  const chatTools = toChatTools(tools);
  const attempts = [];
  for (const provider of providers) {
    let response;
    try {
      response = await fetchImpl(provider.endpoint, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + provider.apiKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: provider.modelId,
          messages,
          ...(chatTools.length ? { tools: chatTools, tool_choice: "auto" } : {}),
          parallel_tool_calls: false,
          stream: false,
          max_tokens: 1024,
        }),
      });
    } catch {
      throw new Error("provider_transport_failed_" + provider.id);
    }
    if (RETRYABLE_STATUS.has(response.status)) {
      attempts.push(provider.id + ":" + response.status);
      continue;
    }
    if (!response.ok) throw new Error("provider_http_" + response.status + "_" + provider.id);
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== "object") throw new Error("provider_response_invalid_" + provider.id);
    const normalized = normalizeResponse(data, provider.id, provider.modelId);
    return Object.freeze({
      response: normalized,
      provider: provider.id,
      model: normalized.model,
      attempts: Object.freeze([...attempts, provider.id + ":200"]),
    });
  }
  throw new Error("provider_cascade_exhausted_" + attempts.join(","));
}

export function listProviderConfiguration(env = {}) {
  return Object.freeze(configuredProviders(env).map((provider) => Object.freeze({
    id: provider.id,
    secret: provider.secret,
    model: provider.modelId,
    endpoint: provider.endpoint,
  })));
}

export const PROVIDER_IDS = Object.freeze(PROVIDERS.map((provider) => provider.id));
export const PROVIDER_MODEL_ALLOWLIST = ALLOWED_MODELS;
