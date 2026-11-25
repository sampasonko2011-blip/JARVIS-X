import { parseICalendar } from "../../../src/core/icalendar.ts";
import { canonicalSnapshot, sha256Hex, validatePronoteSnapshot } from "../../../src/core/pronote-bridge-contract.mjs";

const ALLOWED_ORIGINS = new Set([
  "https://sampasonko2011-blip.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const MAX_BODY_BYTES = 2_000_000;
const MAX_TOKEN_DAYS = 90;

function json(body: unknown, status = 200, origin = "") {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", vary: "Origin" });
  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
    headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error("bridge_configuration_missing");
  return value;
}
function serviceHeaders() {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" };
}
function publishableKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string" && keys.default) return keys.default;
  } catch { /* use legacy publishable key */ }
  return env("SUPABASE_ANON_KEY");
}
async function readBody(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("body_too_large");
  if (!req.body) throw new Error("body_empty");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new Error("body_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}
function bearer(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(value);
  return match?.[1] ?? null;
}
async function authenticatedUser(req: Request) {
  const token = bearer(req);
  if (!token || token.split(".").length !== 3) return null;
  const url = env("SUPABASE_URL");
  const response = await fetch(url + "/auth/v1/user", {
    headers: { apikey: publishableKey(), authorization: "Bearer " + token },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  if (!user || typeof user.id !== "string" || user.is_anonymous === true) return null;
  return user as { id: string };
}
async function rest(path: string, init: RequestInit = {}) {
  const base = env("SUPABASE_URL");
  const response = await fetch(base + "/rest/v1/" + path, {
    ...init,
    headers: { ...serviceHeaders(), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(8_000)
  });
  return response;
}
async function consumeRateLimit(userId: string, key: "minute" | "day") {
  const result = await rest("rpc/consume_hq_rate_limit", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_limit_key: key })
  });
  if (!result.ok) { await result.text(); throw new Error("bridge_rate_limit_unavailable"); }
  const data = await result.json().catch(() => null);
  const row = Array.isArray(data) ? data[0] : null;
  const expected = key === "minute" ? 10 : 100;
  const reset = typeof row?.reset_at === "string" ? Date.parse(row.reset_at) : Number.NaN;
  if (!row || typeof row.allowed !== "boolean" || row.limit_key !== key ||
      row.request_limit !== expected || !Number.isInteger(row.remaining) ||
      row.remaining < 0 || row.remaining >= expected || !Number.isFinite(reset) || reset <= Date.now()) {
    throw new Error("bridge_rate_limit_response_invalid");
  }
  return row as { allowed: boolean; reset_at: string; remaining: number; request_limit: number; limit_key: string };
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}
function eventSnapshotFromIcs(ics: string) {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const end = new Date(now.getTime() + 365 * 86400_000).toISOString();
  const events = parseICalendar(ics, "pronote", { defaultTimezone: "Africa/Dakar", rangeStart: start, rangeEnd: end, maxOccurrences: 2000 });
  return { schemaVersion: "pronote.snapshot.v1", source: "pronote", generatedAt: now.toISOString(), freshnessBasis: "ingestion_time_only", events };
}
async function issueToken(req: Request, origin: string) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "user_authentication_required" }, 401, origin);
  try {
    const minute = await consumeRateLimit(user.id, "minute");
    const day = await consumeRateLimit(user.id, "day");
    const denied = !minute.allowed ? minute : !day.allowed ? day : null;
    if (denied) return json({ error: "bridge_rate_limit_exceeded", reset_at: denied.reset_at }, 429, origin);
  } catch {
    return json({ error: "bridge_rate_limit_unavailable" }, 503, origin);
  }
  const now = new Date().toISOString();
  const prior = await rest("pronote_ipad_ingest_tokens?user_id=eq." + user.id + "&revoked_at=is.null", {
    method: "PATCH", body: JSON.stringify({ revoked_at: now })
  });
  if (!prior.ok) { await prior.text(); return json({ error: "prior_token_rotation_failed" }, 503, origin); }
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + MAX_TOKEN_DAYS * 86400_000).toISOString();
  const response = await rest("pronote_ipad_ingest_tokens", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt })
  });
  if (!response.ok) { await response.text(); return json({ error: "token_issue_failed" }, 503, origin); }
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) return json({ error: "token_issue_receipt_missing" }, 503, origin);
  // Plaintext is returned once only; only its digest is stored server-side.
  return json({ token, token_id: row.id, expires_at: expiresAt, storage_guidance: "Store in a user-controlled password manager. Never paste into source control, URLs, screenshots or chat." }, 201, origin);
}
async function revokeToken(req: Request, origin: string) {
  const user = await authenticatedUser(req);
  if (!user) return json({ error: "user_authentication_required" }, 401, origin);
  let body: Record<string, unknown>;
  try { body = JSON.parse(await readBody(req)); } catch { return json({ error: "invalid_json" }, 400, origin); }
  if (typeof body.token_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.token_id)) return json({ error: "token_id_invalid" }, 400, origin);
  const query = new URLSearchParams({ id: "eq." + body.token_id, user_id: "eq." + user.id, revoked_at: "is.null" });
  const response = await rest("pronote_ipad_ingest_tokens?" + query, {
    method: "PATCH", headers: { prefer: "return=representation" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() })
  });
  if (!response.ok) { await response.text(); return json({ error: "token_revoke_failed" }, 503, origin); }
  const rows = await response.json().catch(() => []);
  return json({ revoked: Array.isArray(rows) && rows.length > 0 }, 200, origin);
}
async function ingest(req: Request, origin: string) {
  const token = bearer(req);
  if (!token || token.split(".").length === 3) return json({ error: "scoped_ingest_token_required" }, 401, origin);
  const tokenHash = await sha256Hex(token);
  const tokenQuery = new URLSearchParams({
    select: "id,user_id,expires_at,revoked_at",
    token_hash: "eq." + tokenHash,
    revoked_at: "is.null",
    expires_at: "gt." + new Date().toISOString(),
    limit: "1"
  });
  const tokenResponse = await rest("pronote_ipad_ingest_tokens?" + tokenQuery);
  if (!tokenResponse.ok) { await tokenResponse.text(); return json({ error: "token_validation_unavailable" }, 503, origin); }
  const tokenRows = await tokenResponse.json().catch(() => []);
  const tokenRow = Array.isArray(tokenRows) ? tokenRows[0] : null;
  if (!tokenRow?.user_id) return json({ error: "ingest_token_invalid_or_expired" }, 401, origin);
  let minute: { allowed: boolean; reset_at: string }, day: { allowed: boolean; reset_at: string };
  try {
    minute = await consumeRateLimit(tokenRow.user_id, "minute");
    day = await consumeRateLimit(tokenRow.user_id, "day");
  } catch {
    return json({ error: "bridge_rate_limit_unavailable" }, 503, origin);
  }
  const denied = !minute.allowed ? minute : !day.allowed ? day : null;
  if (denied) return json({ error: "bridge_rate_limit_exceeded", reset_at: denied.reset_at }, 429, origin);

  let snapshot: Record<string, unknown>;
  try {
    const raw = await readBody(req);
    const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type === "text/calendar" || type === "text/plain") snapshot = eventSnapshotFromIcs(raw);
    else if (type === "application/json") snapshot = JSON.parse(raw);
    else return json({ error: "content_type_must_be_json_or_icalendar" }, 415, origin);
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "body_too_large" ? "body_too_large" : "snapshot_parse_failed" },
      error instanceof Error && error.message === "body_too_large" ? 413 : 400, origin);
  }
  const validation = validatePronoteSnapshot(snapshot);
  if (!validation.valid) return json({ error: "snapshot_validation_failed", reasons: validation.errors }, 422, origin);
  const freshnessBasis = snapshot.freshnessBasis === "ingestion_time_only" ? "ingestion_time_only" : "source_generated_at";
  const canonical = canonicalSnapshot(snapshot as never);
  const snapshotHash = await sha256Hex(canonical);
  const userId = tokenRow.user_id as string;
  const existingQuery = new URLSearchParams({ select: "snapshot_hash,received_at", user_id: "eq." + userId, limit: "1" });
  const existingResponse = await rest("pronote_ipad_snapshots?" + existingQuery);
  if (!existingResponse.ok) { await existingResponse.text(); return json({ error: "snapshot_lookup_failed" }, 503, origin); }
  const existingRows = await existingResponse.json().catch(() => []);
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (existing?.snapshot_hash === snapshotHash) {
    return json({ accepted: true, duplicate: true, snapshot_hash: snapshotHash, received_at: existing.received_at, event_count: (snapshot.events as unknown[]).length }, 200, origin);
  }
  const receivedAt = new Date().toISOString();
  const saved = await rest("pronote_ipad_snapshots?on_conflict=user_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: userId, schema_version: "pronote.snapshot.v1",
      generated_at: snapshot.generatedAt, received_at: receivedAt,
      snapshot_hash: snapshotHash, event_count: (snapshot.events as unknown[]).length,
      snapshot
    })
  });
  if (!saved.ok) { await saved.text(); return json({ error: "snapshot_persistence_failed" }, 503, origin); }
  const rows = await saved.json().catch(() => []);
  if (!Array.isArray(rows) || !rows[0]) return json({ error: "snapshot_persistence_receipt_missing" }, 503, origin);
  await rest("pronote_ipad_ingest_tokens?id=eq." + tokenRow.id, {
    method: "PATCH", body: JSON.stringify({ last_used_at: receivedAt })
  }).catch(() => new Response(null, { status: 503 }));
  return json({ accepted: true, duplicate: false, snapshot_hash: snapshotHash, received_at: receivedAt,
    event_count: (snapshot.events as unknown[]).length, freshness: freshnessBasis === "ingestion_time_only" ? "unknown" : Date.now() - Date.parse(snapshot.generatedAt as string) < 0 ? "unknown" : Date.now() - Date.parse(snapshot.generatedAt as string) <= 24 * 60 * 60 * 1000 ? "fresh" : "stale" }, 201, origin);
}

Deno.serve(async req => {
  const origin = req.headers.get("origin") ?? "";
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return json({}, 204, origin);
  if (req.method === "GET" && url.pathname.endsWith("/health")) return json({ ok: true, capability: "pronote.ipad-bridge", storage: "configured-at-runtime" }, 200, origin);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  try {
    if (url.pathname.endsWith("/token")) return await issueToken(req, origin);
    if (url.pathname.endsWith("/token/revoke")) return await revokeToken(req, origin);
    return await ingest(req, origin);
  } catch {
    // Do not log tokens, event descriptions, student identifiers or provider secrets.
    return json({ error: "bridge_unavailable" }, 503, origin);
  }
});
