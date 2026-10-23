import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseGatewayAdapter } from "../hq/supabase-gateway-adapter.mjs";

const payload = {
  role: "lead",
  objective: "Compare two approaches",
  instructions: "Separate facts from assumptions.",
};

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test("gateway adapter sends the selected provider, model, bounded task and session token", async () => {
  let captured;
  const adapter = createSupabaseGatewayAdapter({
    provider: "openai",
    modelId: "gpt-4.1-mini",
    getAccessToken: async () => "session-token",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response({
        ok: true,
        provider: "openai",
        model: "gpt-4.1-mini",
        output: "Verified transport response",
        latency_ms: 42,
      });
    },
  });
  const controller = new AbortController();
  const result = await adapter.invoke(payload, { signal: controller.signal });
  assert.equal(captured.url, "https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.Authorization, "Bearer session-token");
  assert.equal(captured.options.signal, controller.signal);
  const body = JSON.parse(captured.options.body);
  assert.equal(body.provider, "openai");
  assert.equal(body.model, "gpt-4.1-mini");
  assert.equal(body.task_type, "council_lead");
  assert.match(body.task, /Compare two approaches/);
  assert.equal(result.text, "Verified transport response");
  assert.equal(result.latencyMs, 42);
});

test("adapter is fail-closed for council eligibility until evidence is attached elsewhere", () => {
  const adapter = createSupabaseGatewayAdapter({
    provider: "google",
    modelId: "gemini-2.5-flash",
    getAccessToken: async () => "token",
    fetchImpl: async () => response({}),
  });
  assert.equal(adapter.authorized, false);
  assert.equal(adapter.liveTestPassed, false);
  assert.equal(adapter.status, "NOT_LIVE_TESTED");
});

test("adapter rejects unsupported providers, models and untrusted gateway URLs", () => {
  const common = { getAccessToken: async () => "token", fetchImpl: async () => response({}) };
  assert.throws(() => createSupabaseGatewayAdapter({ ...common, provider: "other", modelId: "model" }), /provider_not_supported/);
  assert.throws(() => createSupabaseGatewayAdapter({ ...common, provider: "openai", modelId: "gpt-4o" }), /model_not_allowed/);
  assert.throws(() => createSupabaseGatewayAdapter({
    ...common,
    provider: "openai",
    modelId: "gpt-4.1-mini",
    gatewayUrl: "https://attacker.example/functions/v1/hq-gateway",
  }), /gateway_url_not_trusted/);
});

test("adapter refuses missing sessions without making a network request", async () => {
  let calls = 0;
  const adapter = createSupabaseGatewayAdapter({
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    getAccessToken: async () => null,
    fetchImpl: async () => { calls++; return response({}); },
  });
  await assert.rejects(adapter.invoke(payload), /gateway_session_unavailable/);
  assert.equal(calls, 0);
});

test("adapter rejects oversized prompts before network access", async () => {
  let calls = 0;
  const adapter = createSupabaseGatewayAdapter({
    provider: "openai",
    modelId: "gpt-4.1-mini",
    getAccessToken: async () => "token",
    fetchImpl: async () => { calls++; return response({}); },
  });
  await assert.rejects(
    adapter.invoke({ ...payload, objective: "x".repeat(12_500) }),
    /gateway_task_too_large/,
  );
  assert.equal(calls, 0);
});

test("adapter rejects HTTP errors or mismatched provider/model identities", async () => {
  const base = {
    provider: "openai",
    modelId: "gpt-4.1-mini",
    getAccessToken: async () => "token",
  };
  const failed = createSupabaseGatewayAdapter({
    ...base,
    fetchImpl: async () => response({ error: "provider_request_failed" }, 502),
  });
  await assert.rejects(failed.invoke(payload), /gateway_http_502_provider_request_failed/);

  const mismatched = createSupabaseGatewayAdapter({
    ...base,
    fetchImpl: async () => response({
      ok: true,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      output: "wrong provider",
    }),
  });
  await assert.rejects(mismatched.invoke(payload), /gateway_response_invalid/);
});
