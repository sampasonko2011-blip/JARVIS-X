/**
 * JARVIS-X Supabase Gateway transport adapter.
 *
 * This module only transports a council stage to the deployed gateway. It does
 * not establish provider authorization, live-test evidence, or world-state
 * verification. Callers must keep those eligibility gates false until the
 * corresponding evidence has been independently verified.
 */

const ALLOWED_MODELS = Object.freeze({
  openai: Object.freeze(["gpt-4.1-mini"]),
  anthropic: Object.freeze(["claude-sonnet-4-20250514"]),
  google: Object.freeze(["gemini-2.5-flash"]),
});

const DEFAULT_GATEWAY_URL =
  "https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway";
const MAX_TASK_BYTES = 12_000;
const ALLOWED_ROLES = new Set(["lead", "critic", "synthesizer"]);
const MAX_REQUEST_TIMEOUT_MS = 30_000;

function validateGatewayUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("gateway_url_invalid");
  }
  const localDevelopment =
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    url.protocol === "http:";
  const trustedSupabase =
    url.protocol === "https:" &&
    /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname);
  if ((!trustedSupabase && !localDevelopment) ||
      url.username || url.password ||
      url.pathname !== "/functions/v1/hq-gateway" ||
      url.search || url.hash) {
    throw new TypeError("gateway_url_not_trusted");
  }
  return url.toString();
}

function stageTask(payload) {
  if (!payload || typeof payload !== "object" ||
      !ALLOWED_ROLES.has(payload.role) ||
      typeof payload.objective !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.instructions !== "string") {
    throw new TypeError("council_payload_invalid");
  }
  const task = JSON.stringify({
    role: payload.role,
    objective: payload.objective,
    instructions: payload.instructions,
    ...(typeof payload.leadAnswer === "string" ? { leadAnswer: payload.leadAnswer } : {}),
    ...(typeof payload.critique === "string" ? { critique: payload.critique } : {}),
  });
  if (new TextEncoder().encode(task).byteLength > MAX_TASK_BYTES) {
    throw new RangeError("gateway_task_too_large");
  }
  return task;
}

/**
 * Create a transport adapter for one supported gateway provider.
 *
 * IMPORTANT: returned adapters are intentionally ineligible for runCouncil
 * until authorization, live-test and independent verification evidence has
 * been established outside this factory and attached by the trusted caller.
 */
export function createSupabaseGatewayAdapter({
  provider,
  modelId,
  publishableKey,
  getAccessToken,
  gatewayUrl = DEFAULT_GATEWAY_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!Object.hasOwn(ALLOWED_MODELS, provider)) {
    throw new TypeError("provider_not_supported");
  }
  if (!ALLOWED_MODELS[provider].includes(modelId)) {
    throw new TypeError("model_not_allowed");
  }
  if (typeof publishableKey !== "string" || !publishableKey.trim()) {
    throw new TypeError("publishable_key_required");
  }
  if (typeof getAccessToken !== "function") {
    throw new TypeError("access_token_provider_required");
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetch_implementation_required");
  }
  const endpoint = validateGatewayUrl(gatewayUrl);

  return Object.freeze({
    id: provider,
    modelId,
    authorized: false,
    liveTestPassed: false,
    status: "NOT_LIVE_TESTED",
    async invoke(payload, { signal } = {}) {
      const task = stageTask(payload);
      const accessToken = await getAccessToken();
      if (typeof accessToken !== "string" || !accessToken.trim()) {
        throw new Error("gateway_session_unavailable");
      }
      const timeoutSignal = AbortSignal.timeout(MAX_REQUEST_TIMEOUT_MS);
      const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "apikey": publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          model: modelId,
          task,
          task_type: `council_${payload.role}`.slice(0, 100),
        }),
        signal: requestSignal,
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const code = typeof data?.error === "string" ? data.error : "gateway_request_failed";
        throw new Error(`gateway_http_${response.status}_${code.slice(0, 80)}`);
      }
      if (data?.ok !== true || data.provider !== provider ||
          data.model !== modelId || typeof data.output !== "string" ||
          !data.output.trim()) {
        throw new Error("gateway_response_invalid");
      }
      return {
        text: data.output,
        requestId: typeof data.request_id === "string" ? data.request_id.slice(0, 200) : null,
        latencyMs: Number.isFinite(data.latency_ms) && data.latency_ms >= 0
          ? data.latency_ms
          : null,
      };
    },
  });
}
