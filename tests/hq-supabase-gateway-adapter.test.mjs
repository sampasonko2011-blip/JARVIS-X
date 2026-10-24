import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseGatewayAdapter } from "../hq/supabase-gateway-adapter.mjs";
import { runCouncil } from "../hq/council-runtime.mjs";

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
    publishableKey: "sb_publishable_test",
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
  assert.equal(captured.options.headers.apikey, "sb_publishable_test");
  assert.notEqual(captured.options.signal, controller.signal);
  assert.equal(captured.options.signal.aborted, false);
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
    publishableKey: "sb_publishable_test",
    getAccessToken: async () => "token",
    fetchImpl: async () => response({}),
  });
  assert.equal(adapter.authorized, false);
  assert.equal(adapter.liveTestPassed, false);
  assert.equal(adapter.status, "NOT_LIVE_TESTED");
});

test("adapter rejects unsupported providers, models and untrusted gateway URLs", () => {
  const common = { publishableKey: "sb_publishable_test", getAccessToken: async () => "token", fetchImpl: async () => response({}) };
  assert.throws(() => createSupabaseGatewayAdapter({ ...common, provider: "other", modelId: "model" }), /provider_not_supported/);
  assert.throws(() => createSupabaseGatewayAdapter({ ...common, provider: "openai", modelId: "gpt-4o" }), /model_not_allowed/);
  assert.throws(() => createSupabaseGatewayAdapter({
    ...common,
    provider: "openai",
    modelId: "gpt-4.1-mini",
    gatewayUrl: "https://attacker.example/functions/v1/hq-gateway",
  }), /gateway_url_not_trusted/);
  assert.throws(() => createSupabaseGatewayAdapter({
    ...common,
    provider: "openai",
    modelId: "gpt-4.1-mini",
    gatewayUrl: "https://other-project.supabase.co/functions/v1/hq-gateway",
  }), /gateway_url_not_trusted/);
  assert.throws(() => createSupabaseGatewayAdapter({
    ...common,
    provider: "openai",
    modelId: "gpt-4.1-mini",
    gatewayUrl: "https://xfewajxkqntflfntisut.supabase.co.attacker.example/functions/v1/hq-gateway",
  }), /gateway_url_not_trusted/);
  assert.throws(() => createSupabaseGatewayAdapter({
    ...common,
    provider: "openai",
    modelId: "gpt-4.1-mini",
    gatewayUrl: "https://xfewajxkqntflfntisut.supabase.co/functions/v1/hq-gateway?redirect=https://attacker.example",
  }), /gateway_url_not_trusted/);
  assert.throws(() => createSupabaseGatewayAdapter({
    ...common,
    provider: "openai",
    modelId: "gpt-4.1-mini",
  }), /council_payload_invalid/);
  assert.throws(() => createSupabaseGatewayAdapter({
    ...common,
    provider: "openai",
    modelId: "gpt-4.1-mini",
    gatewayUrl: "https://xfewajxkqntflfntisut.supabase.co.attacker.example/functions/v1/hq-gateway",
  }), /gateway_url_not_trusted/);
  assert.throws(() => createSupabaseGatewayAdapter({
    getAccessToken: async () => "token",
    fetchImpl: async () => response({}),
    provider: "openai",
    modelId: "gpt-4.1-mini",
  }), /publishable_key_required/);
  const valid = createSupabaseGatewayAdapter({
    ...common,
    provider: "openai",
    modelId: "gpt-4.1-mini",
  });
  assert.equal(valid.status, "NOT_LIVE_TESTED");
  assert.equal(valid.authorized, false);
});

test("adapter rejects arbitrary council roles before making a network request", async () => {
  let calls = 0;
  const adapter = createSupabaseGatewayAdapter({
    provider: "openai",
    modelId: "gpt-4.1-mini",
    publishableKey: "sb_publishable_test",
    getAccessToken: async () => "token",
    fetchImpl: async () => { calls++; return response({}); },
  });
  await assert.rejects(
    adapter.invoke({ ...payload, role: "admin" }),
    /council_payload_invalid/,
  );
  assert.equal(calls, 0);
});

test("adapter refuses missing sessions without making a network request", async () => {
  let calls = 0;
  const adapter = createSupabaseGatewayAdapter({
    provider: "anthropic",
    modelId: "claude-sonnet-4-20250514",
    publishableKey: "sb_publishable_test",
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
    publishableKey: "sb_publishable_test",
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
    publishableKey: "sb_publishable_test",
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

test("adapter rejects untrusted subdomains, non-council roles and missing publishable keys", async () => {
  const base = {
    provider: "openai",
    modelId: "gpt-4.1-mini",
    publishableKey: "sb_publishable_test",
    getAccessToken: async () => "token",
    fetchImpl: async () => response({}),
  };
  assert.throws(() => createSupabaseGatewayAdapter({
    ...base,
    gatewayUrl: "https://xfewajxkqntflfntisut.supabase.co.attacker.example/functions/v1/hq-gateway",
  }), /gateway_url_not_trusted/);
  const adapter = createSupabaseGatewayAdapter(base);
  await assert.rejects(adapter.invoke({ ...payload, role: "admin" }), /council_payload_invalid/);
  assert.throws(() => createSupabaseGatewayAdapter({
    ...base,
    publishableKey: "",
  }), /publishable_key_required/);
});

test("adapter adds a bounded timeout signal to each network request", async () => {
  let capturedSignal;
  const adapter = createSupabaseGatewayAdapter({
    provider: "openai",
    modelId: "gpt-4.1-mini",
    publishableKey: "sb_publishable_test",
    getAccessToken: async () => "token",
    fetchImpl: async (_url, options) => {
      capturedSignal = options.signal;
      return response({
        ok: true,
        provider: "openai",
        model: "gpt-4.1-mini",
        output: "timeout policy attached",
        latency_ms: 5,
      });
    },
  });
  await adapter.invoke(payload);
  assert.ok(capturedSignal instanceof AbortSignal);
  assert.equal(capturedSignal.aborted, false);
});

test("unverified gateway adapters cannot activate the council or make network calls", async () => {
  let networkCalls = 0;
  const providers = [
    ["openai", "gpt-4.1-mini"],
    ["anthropic", "claude-sonnet-4-20250514"],
    ["google", "gemini-2.5-flash"],
  ].map(([provider, modelId]) => createSupabaseGatewayAdapter({
    provider,
    modelId,
    publishableKey: "sb_publishable_test",
    getAccessToken: async () => "test-session",
    fetchImpl: async () => {
      networkCalls++;
      return response({ ok: true, provider, model: modelId, output: "should not be called" });
    },
  }));

  const result = await runCouncil({
    objective: "Test fail-closed provider eligibility",
    providers,
  });

  assert.equal(result.status, "MANUAL_HANDOFF");
  assert.equal(result.reason, "INSUFFICIENT_VERIFIED_AUTHORIZED_PROVIDERS");
  assert.equal(result.providerCalls, 0);
  assert.equal(networkCalls, 0);
});
