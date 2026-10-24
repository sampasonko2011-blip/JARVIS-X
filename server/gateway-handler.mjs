import { timingSafeEqual } from "node:crypto";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};

function send(res, status, body) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

function sameOrigin(req, allowedOrigin) {
  const origin = req.headers?.origin;
  if (typeof origin !== "string" || !origin || !allowedOrigin) return false;
  try {
    return new URL(origin).origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}

function safePrincipalId(principal) {
  return typeof principal?.id === "string" && principal.id.trim()
    ? principal.id.trim().slice(0, 160)
    : null;
}

async function readJsonBody(req, maxBodyBytes) {
  const declaredLength = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    const error = new Error("REQUEST_BODY_TOO_LARGE");
    error.status = 413;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      const error = new Error("REQUEST_BODY_TOO_LARGE");
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch {
    const error = new Error("INVALID_JSON");
    error.status = 400;
    throw error;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("JSON_OBJECT_REQUIRED");
    error.status = 400;
    throw error;
  }
  return value;
}

/**
 * Framework-neutral Node HTTP handler for the static HQ's same-origin API.
 *
 * Production must inject a real session authenticator and a trusted composite
 * runtime. This module intentionally has no permissive default authentication.
 * For multi-instance deployments, replace the in-memory limiter with a shared
 * atomic rate-limit store.
 */
export function createGatewayHandler({
  runtime,
  authenticateRequest,
  allowedOrigin,
  service = "jarvis-x-gateway",
  version = "0.1.0",
  environment = process.env.NODE_ENV || "production",
  maxBodyBytes = 16 * 1024,
  maxMessageChars = 12_000,
  maxRequestsPerMinute = 20,
  now = () => Date.now(),
} = {}) {
  if (!runtime || typeof runtime.run !== "function" ||
      typeof authenticateRequest !== "function" ||
      typeof allowedOrigin !== "string" || !allowedOrigin.trim() ||
      !Number.isInteger(maxBodyBytes) || maxBodyBytes < 1 ||
      !Number.isInteger(maxMessageChars) || maxMessageChars < 1 ||
      !Number.isInteger(maxRequestsPerMinute) || maxRequestsPerMinute < 1 ||
      typeof now !== "function") {
    throw new TypeError("GATEWAY_CONFIGURATION_INVALID");
  }

  const rateWindows = new Map();

  function consumeRateLimit(principalId) {
    const current = now();
    if (!Number.isFinite(current)) throw new TypeError("GATEWAY_CLOCK_INVALID");
    const previous = rateWindows.get(principalId);
    const window = !previous || current - previous.startedAt >= 60_000
      ? { startedAt: current, count: 0 }
      : previous;
    if (window.count >= maxRequestsPerMinute) return false;
    window.count++;
    rateWindows.set(principalId, window);
    if (rateWindows.size > 10_000) {
      for (const [key, value] of rateWindows) {
        if (current - value.startedAt >= 60_000) rateWindows.delete(key);
      }
    }
    return true;
  }

  return async function gatewayHandler(req, res) {
    const url = new URL(req.url || "/", "http://gateway.invalid");
    if (url.pathname !== "/api/v1/health" && url.pathname !== "/api/v1/chat") {
      return send(res, 404, { error: "NOT_FOUND" });
    }

    if (!sameOrigin(req, allowedOrigin)) {
      return send(res, 403, { error: "ORIGIN_NOT_ALLOWED" });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/health") {
      let principal = null;
      try { principal = await authenticateRequest(req); }
      catch { principal = null; }
      const authenticated = Boolean(safePrincipalId(principal));
      return send(res, 200, {
        status: "ok",
        service,
        version,
        environment,
        authenticated,
        chat_enabled: authenticated,
        providers: [],
      });
    }

    if (req.method !== "POST" || url.pathname !== "/api/v1/chat") {
      res.setHeader?.("allow", url.pathname === "/api/v1/health" ? "GET" : "POST");
      return send(res, 405, { error: "METHOD_NOT_ALLOWED" });
    }

    let principal;
    try { principal = await authenticateRequest(req); }
    catch { principal = null; }
    const principalId = safePrincipalId(principal);
    if (!principalId) return send(res, 401, { error: "AUTHENTICATION_REQUIRED" });

    if (!consumeRateLimit(principalId)) {
      return send(res, 429, { error: "RATE_LIMITED" });
    }

    if (!String(req.headers?.["content-type"] || "").toLowerCase().includes("application/json")) {
      return send(res, 415, { error: "JSON_REQUIRED" });
    }

    let payload;
    try { payload = await readJsonBody(req, maxBodyBytes); }
    catch (error) {
      return send(res, Number.isInteger(error?.status) ? error.status : 400, {
        error: error?.message === "REQUEST_BODY_TOO_LARGE"
          ? "REQUEST_BODY_TOO_LARGE"
          : error?.message === "JSON_OBJECT_REQUIRED" ? "JSON_OBJECT_REQUIRED" : "INVALID_JSON",
      });
    }

    if (typeof payload.message !== "string" ||
        !payload.message.trim() ||
        payload.message.length > maxMessageChars) {
      return send(res, 400, { error: "MESSAGE_INVALID" });
    }
    if (payload.conversation_id !== undefined &&
        (typeof payload.conversation_id !== "string" || payload.conversation_id.length > 160)) {
      return send(res, 400, { error: "CONVERSATION_ID_INVALID" });
    }

    try {
      const result = await runtime.run({ objective: payload.message.trim() });
      if (result?.status !== "COMPLETED" ||
          result?.composite?.status !== "EXECUTED_NOT_QUALITY_PROMOTED" ||
          typeof result?.answer !== "string" || !result.answer.trim()) {
        return send(res, 503, {
          error: "EXECUTION_NOT_VERIFIED",
          status: typeof result?.status === "string" ? result.status : "UNKNOWN",
          reason: typeof result?.reason === "string" ? result.reason : "RUNTIME_NOT_COMPLETED",
        });
      }
      return send(res, 200, {
        reply: result.answer,
        execution: {
          status: result.status,
          qualityStatus: result.composite.status,
          providerCalls: Number.isInteger(result.providerCalls) ? result.providerCalls : null,
          traceId: typeof result.traceId === "string" ? result.traceId.slice(0, 160) : null,
        },
      });
    } catch {
      // Provider errors may contain request details; never reflect them to clients.
      return send(res, 502, { error: "UPSTREAM_EXECUTION_FAILED" });
    }
  };
}
