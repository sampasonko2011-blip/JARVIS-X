import test from "node:test";
import assert from "node:assert/strict";
import { createLocalMemoryBridge } from "../hq/local-memory-bridge.js";

function storage(initial = null) {
  let value = initial ? JSON.stringify(initial) : null;
  return {
    getItem(key) { assert.equal(key, "jx-auth-session"); return value; },
    setItem(key, next) { assert.equal(key, "jx-auth-session"); value = next; },
    removeItem(key) { assert.equal(key, "jx-auth-session"); value = null; },
    read() { return value ? JSON.parse(value) : null; },
  };
}
const freshSession = () => ({
  access_token: "session-access",
  refresh_token: "session-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});

test("local memory bridge refuses to call the gateway without an HQ session", async () => {
  let calls = 0;
  const bridge = createLocalMemoryBridge({
    storage: storage(),
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
  });
  await assert.rejects(bridge.recall("continuity"), /Sign in from HQ Chat/);
  assert.equal(calls, 0);
});

test("recall and remember send explicit consent and the current session", async () => {
  const store = storage(freshSession());
  const calls = [];
  const bridge = createLocalMemoryBridge({
    storage: store,
    supabaseUrl: "https://example.supabase.co",
    publishableKey: "public-test-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true, status: "stored", context: "prior note" }), { status: 200 });
    },
  });
  await bridge.recall("previous decisions");
  await bridge.remember("task", "answer");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /hq-memory-v1\/recall$/);
  assert.match(calls[1].url, /hq-memory-v1\/remember$/);
  for (const call of calls) {
    assert.equal(call.options.headers.Authorization, "Bearer session-access");
    assert.equal(call.options.headers.apikey, "public-test-key");
    assert.equal(JSON.parse(call.options.body).memory_consent, true);
  }
  assert.equal(JSON.parse(calls[1].options.body).task_type, "local_chat");
});

test("expired HQ session refreshes without putting tokens in the URL", async () => {
  const store = storage({
    access_token: "expired",
    refresh_token: "refresh-me",
    expires_at: Math.floor(Date.now() / 1000) - 10,
  });
  const calls = [];
  const bridge = createLocalMemoryBridge({
    storage: store,
    supabaseUrl: "https://example.supabase.co",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/auth/v1/token")) {
        return new Response(JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, status: "recalled", context: "" }), { status: 200 });
    },
  });
  await bridge.recall("test");
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /auth\/v1\/token/);
  assert.equal(calls[1].options.headers.Authorization, "Bearer new-access");
  assert.equal(store.read().refresh_token, "new-refresh");
  assert.equal(calls.some(call => call.url.includes("new-access")), false);
});

test("failed refresh clears the stale session and stops memory access", async () => {
  const store = storage({
    access_token: "expired",
    refresh_token: "bad-refresh",
    expires_at: 1,
  });
  const bridge = createLocalMemoryBridge({
    storage: store,
    fetchImpl: async () => new Response("{}", { status: 401 }),
  });
  await assert.rejects(bridge.recall("test"), /sign-in expired/i);
  assert.equal(store.read(), null);
});

test("invalid inputs are rejected before network access", async () => {
  let calls = 0;
  const bridge = createLocalMemoryBridge({
    storage: storage(freshSession()),
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
  });
  assert.throws(() => bridge.recall(""), /memory_query_invalid/);
  assert.throws(() => bridge.remember("task", ""), /memory_record_invalid/);
  assert.equal(calls, 0);
});
