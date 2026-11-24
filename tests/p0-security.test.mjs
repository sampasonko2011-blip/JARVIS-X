import test from "node:test";
import assert from "node:assert/strict";
import { invokeProviderCascade, listProviderConfiguration, PROVIDER_IDS } from "../supabase/functions/hq-gateway-v12/provider-cascade.mjs";
import { createLocalMemoryBridge } from "../hq/local-memory-bridge.js";
import { createRateLimitConsumer } from "../supabase/functions/hq-memory-v1/rate-limit-client.mjs";
import { resolveMemoryReadiness } from "../supabase/functions/hq-gateway-v12/memory-readiness.mjs";

test("OpenRouter is absent from the provider registry and cannot be selected by env flags", async () => {
  assert.equal(PROVIDER_IDS.includes("openrouter"), false);
  const env = {
    JX_ENABLE_PROVIDER_CASCADE: "true",
    JX_PROVIDER_OPENROUTER_ENABLED: "true",
    OPENROUTER_API_KEY: "test-only-not-a-real-key",
  };
  assert.deepEqual(listProviderConfiguration(env), []);
  let fetchCalls = 0;
  await assert.rejects(
    invokeProviderCascade({ input: "test", env, fetchImpl: async () => { fetchCalls += 1; } }),
    /provider_cascade_not_configured/,
  );
  assert.equal(fetchCalls, 0);
});

test("local memory bridge refuses recall and remember without explicit per-call consent", async () => {
  const storage = {
    getItem: () => JSON.stringify({ access_token: "test-token", refresh_token: "test-refresh", expires_at: 4_000_000_000 }),
    setItem() {},
  };
  let fetchCalls = 0;
  const bridge = createLocalMemoryBridge({
    storage,
    fetchImpl: async () => { fetchCalls += 1; return new Response("{}", { status: 200 }); },
  });
  await assert.rejects(bridge.recall("topic"), /explicit_memory_consent_required/);
  await assert.rejects(bridge.recall("topic", { consent: false }), /explicit_memory_consent_required/);
  await assert.rejects(bridge.remember("task", "answer"), /explicit_memory_consent_required/);
  await assert.rejects(bridge.remember("task", "answer", { consent: false }), /explicit_memory_consent_required/);
  assert.equal(fetchCalls, 0);
});

test("local memory bridge forwards only explicitly granted consent", async () => {
  const storage = {
    getItem: () => JSON.stringify({ access_token: "test-token", refresh_token: "test-refresh", expires_at: 4_000_000_000 }),
    setItem() {},
  };
  const bodies = [];
  const bridge = createLocalMemoryBridge({
    storage,
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  await bridge.recall("topic", { consent: true });
  await bridge.remember("task", "answer", { consent: true });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies.map((body) => body.memory_consent), [true, true]);
});

test("v1 rate limit client uses service-role credentials and the full RPC contract", async () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  let request;
  const consume = createRateLimitConsumer({
    supabaseUrl: "https://example.supabase.co/",
    serviceRoleKey: "server-only-test-secret",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify([{
        allowed: true,
        limit_key: "minute",
        request_limit: 10,
        remaining: 9,
        reset_at: new Date(Date.now() + 60_000).toISOString(),
      }]), { status: 200 });
    },
  });
  const row = await consume(userId, "minute");
  assert.equal(row.allowed, true);
  assert.equal(request.url, "https://example.supabase.co/rest/v1/rpc/consume_hq_rate_limit");
  assert.equal(request.init.headers.apikey, "server-only-test-secret");
  assert.equal(request.init.headers.Authorization, "Bearer server-only-test-secret");
  assert.deepEqual(JSON.parse(request.init.body), { p_user_id: userId, p_limit_key: "minute" });
});

test("v1 rate limit client fails closed when server credentials or RPC response are invalid", async () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const missing = createRateLimitConsumer({ supabaseUrl: "https://example.supabase.co" });
  await assert.rejects(missing(userId, "minute"), /rate_limit_service_credentials_missing/);
  const malformed = createRateLimitConsumer({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "server-only-test-secret",
    fetchImpl: async () => new Response(JSON.stringify([{ allowed: true, limit_key: "minute" }]), { status: 200 }),
  });
  await assert.rejects(malformed(userId, "minute"), /rate_limit_response_invalid/);
});

test("memory readiness distinguishes OAuth from legacy fallback", () => {
  assert.deepEqual(resolveMemoryReadiness({
    supabaseUrlConfigured: true,
    serviceRoleConfigured: true,
    encryptionSecretConfigured: true,
    legacyApiKeyConfigured: false,
  }), {
    oauthConfigurationReady: true, legacyFallbackConfigured: false, memoryConfigured: true, mode: "oauth-configured",
  });
  assert.deepEqual(resolveMemoryReadiness({
    legacyApiKeyConfigured: true,
  }), {
    oauthConfigurationReady: false, legacyFallbackConfigured: true, memoryConfigured: true, mode: "legacy-fallback-configured",
  });
  assert.deepEqual(resolveMemoryReadiness(), {
    oauthConfigurationReady: false, legacyFallbackConfigured: false, memoryConfigured: false, mode: "unavailable",
  });
});
