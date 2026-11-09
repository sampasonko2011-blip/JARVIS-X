import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryGateway } from "../supabase/functions/hq-memory-v1/memory-gateway.mjs";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.com" };
function setup(overrides = {}) {
  const calls = [];
  const memoryClient = {
    recall: async (...args) => { calls.push(["recall", ...args]); return { status: "recalled", context: "prior decision" }; },
    store: async (...args) => { calls.push(["store", ...args]); return "stored"; },
  };
  const handle = createMemoryGateway({
    allowedEmails: "owner@example.com",
    allowedOrigins: ["https://sampasonko2011-blip.github.io"],
    authenticate: async () => user,
    consumeRateLimit: async (id, key) => { calls.push(["rate", id, key]); return { allowed: true, reset_at: new Date(Date.now() + 60000).toISOString() }; },
    memoryClient,
    ...overrides,
  });
  return { handle, calls };
}
function request(path, body, headers = {}) {
  return new Request("https://project.supabase.co/functions/v1/hq-memory-v1/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer valid-session", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("recall requires consent and passes only verified user identity to memory", async () => {
  const { handle, calls } = setup();
  const denied = await handle(request("recall", { query: "remember this", memory_consent: false }));
  assert.equal(denied.status, 403);
  assert.equal(calls.length, 0);
  const allowed = await handle(request("recall", { query: "remember this", memory_consent: true }));
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).context_is_untrusted, true);
  assert.deepEqual(calls.find(x => x[0] === "recall"), ["recall", "remember this", user.id, { consent: true }]);
});

test("remember is separately consent-gated and scoped to authenticated user", async () => {
  const { handle, calls } = setup();
  const result = await handle(request("remember", { task: "decision", answer: "keep zero-spend", memory_consent: true }));
  assert.equal(result.status, 200);
  assert.deepEqual(calls.find(x => x[0] === "store"), ["store", "decision", "keep zero-spend", user.id, "local_chat", { consent: true }]);
});

test("missing allowlist fails closed before memory access", async () => {
  const { handle, calls } = setup({ allowedEmails: "" });
  const result = await handle(request("recall", { query: "x", memory_consent: true }));
  assert.equal(result.status, 503);
  assert.equal(calls.length, 0);
});

test("unlisted account cannot access memory", async () => {
  const { handle, calls } = setup({ authenticate: async () => ({ ...user, email: "other@example.com" }) });
  const result = await handle(request("recall", { query: "x", memory_consent: true }));
  assert.equal(result.status, 403);
  assert.equal(calls.length, 0);
});

test("rate limit failure and denial fail closed", async () => {
  const unavailable = setup({ consumeRateLimit: async () => { throw new Error("db unavailable"); } });
  assert.equal((await unavailable.handle(request("recall", { query: "x", memory_consent: true }))).status, 503);
  const limitedCalls = [];
  const limited = setup({ consumeRateLimit: async (_id, key) => {
    limitedCalls.push(key);
    return { allowed: false, reset_at: new Date(Date.now() + 60000).toISOString() };
  } });
  assert.equal((await limited.handle(request("recall", { query: "x", memory_consent: true }))).status, 429);
  assert.deepEqual(limitedCalls, ["minute"]);
});

test("invalid payloads and origins are rejected", async () => {
  const { handle } = setup();
  assert.equal((await handle(request("recall", { query: "x".repeat(4001), memory_consent: true }))).status, 400);
  assert.equal((await handle(request("recall", { query: "x", memory_consent: true }, { Origin: "https://evil.example" }))).status, 403);
});

test("missing XMemo credential is surfaced as unavailable without inference fallback", async () => {
  const memoryClient = { recall: async () => ({ status: "not_configured", context: "" }), store: async () => "not_configured" };
  const { handle } = setup({ memoryClient });
  const result = await handle(request("recall", { query: "x", memory_consent: true }));
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error, "memory_provider_not_configured");
});

test("production adapter uses the caller JWT for the self-scoped rate-limit RPC", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../supabase/functions/hq-memory-v1/index.ts", import.meta.url), "utf8");
  assert.match(source, /Authorization: "Bearer " \+ token/);
  assert.match(source, /JSON\.stringify\(\{ p_limit_key: key \}\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|p_user_id/);
});
