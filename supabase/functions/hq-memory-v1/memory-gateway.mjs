const MAX_BODY_BYTES = 16_384;
const MAX_QUERY_CHARS = 4_000;
const MAX_TASK_CHARS = 4_000;
const MAX_ANSWER_CHARS = 8_000;

function response(body, status, origin, allowedOrigins) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBoundedJson(req) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("body_too_large");
  if (!req.body) throw new Error("invalid_json");
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Error("invalid_json");
  }
}

export function createMemoryGateway({
  allowedEmails = "",
  allowedOrigins = /** @type {string[]} */ ([]),
  authenticate,
  consumeRateLimit,
  memoryClient,
} = {}) {
  if (typeof authenticate !== "function" || typeof consumeRateLimit !== "function" ||
      !memoryClient || typeof memoryClient.recall !== "function" || typeof memoryClient.store !== "function") {
    throw new TypeError("memory_gateway_dependencies_required");
  }
  const emailAllowlist = new Set(String(allowedEmails).split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
  const origins = new Set(allowedOrigins);

  return async function handle(req) {
    const origin = req.headers.get("origin") ?? "";
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      if (origin && !origins.has(origin)) return response({ error: "origin_not_allowed" }, 403, origin, origins);
      return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...(origins.has(origin) ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      } : {}) } });
    }
    if (origin && !origins.has(origin)) return response({ error: "origin_not_allowed" }, 403, origin, origins);
    if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405, origin, origins);

    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
    const token = match?.[1] ?? "";
    if (!token || token.length > 8192) return response({ error: "authentication_required" }, 401, origin, origins);

    let user;
    try { user = await authenticate(token); }
    catch { return response({ error: "authentication_service_unavailable" }, 503, origin, origins); }
    if (!user || typeof user.id !== "string" || !user.id.trim() || user.is_anonymous === true) {
      return response({ error: "invalid_or_anonymous_session" }, 401, origin, origins);
    }
    if (emailAllowlist.size === 0) return response({ error: "memory_access_policy_not_configured" }, 503, origin, origins);
    if (typeof user.email !== "string" || !emailAllowlist.has(user.email.trim().toLowerCase())) {
      return response({ error: "account_not_allowlisted" }, 403, origin, origins);
    }

    let body;
    try { body = await readBoundedJson(req); }
    catch (error) {
      const tooLarge = error instanceof Error && error.message === "body_too_large";
      return response({ error: tooLarge ? "request_body_too_large" : "invalid_json" }, tooLarge ? 413 : 400, origin, origins);
    }
    if (body.memory_consent !== true) return response({ error: "explicit_memory_consent_required" }, 403, origin, origins);

    const route = url.pathname.replace(/\/+$/, "").split("/").pop();
    if (route !== "recall" && route !== "remember") return response({ error: "route_not_found" }, 404, origin, origins);
    if (route === "recall" && (typeof body.query !== "string" || !body.query.trim() || body.query.length > MAX_QUERY_CHARS)) {
      return response({ error: "query_must_be_1_to_4000_characters" }, 400, origin, origins);
    }
    if (route === "remember" && (
      typeof body.task !== "string" || !body.task.trim() || body.task.length > MAX_TASK_CHARS ||
      typeof body.answer !== "string" || !body.answer.trim() || body.answer.length > MAX_ANSWER_CHARS
    )) return response({ error: "task_or_answer_invalid" }, 400, origin, origins);

    try {
      const minute = await consumeRateLimit(user.id, "minute");
      const day = await consumeRateLimit(user.id, "day");
      const denied = !minute?.allowed ? minute : !day?.allowed ? day : null;
      if (denied) {
        const reset = Date.parse(denied.reset_at);
        const retryAfter = Number.isFinite(reset) ? Math.max(1, Math.min(86400, Math.ceil((reset - Date.now()) / 1000))) : 60;
        return response({ error: "rate_limit_exceeded", retry_after_seconds: retryAfter }, 429, origin, origins);
      }
    } catch {
      return response({ error: "rate_limit_service_unavailable" }, 503, origin, origins);
    }

    if (route === "recall") {
      const result = await memoryClient.recall(body.query.trim(), user.id, { consent: true });
      if (result.status === "not_configured") return response({ error: "memory_provider_not_configured", status: result.status }, 503, origin, origins);
      if (result.status === "invalid_user") return response({ error: "memory_identity_invalid" }, 401, origin, origins);
      if (result.status === "unavailable") return response({ error: "memory_provider_unavailable", status: result.status }, 502, origin, origins);
      return response({ ok: true, status: result.status, context: result.context, context_is_untrusted: true }, 200, origin, origins);
    }

    const status = await memoryClient.store(body.task.trim(), body.answer.trim(), user.id,
      typeof body.task_type === "string" ? body.task_type.slice(0, 80) : "local_chat", { consent: true });
    if (status === "not_configured") return response({ error: "memory_provider_not_configured", status }, 503, origin, origins);
    if (status !== "stored") return response({ error: "memory_write_failed", status }, 502, origin, origins);
    return response({ ok: true, status: "stored" }, 200, origin, origins);
  };
}
