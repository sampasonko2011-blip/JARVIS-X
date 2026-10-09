import test from "node:test";
import assert from "node:assert/strict";
import { OrbitProvider } from "../dist/core/orbit-provider.js";

const input = {
  task: {
    id: "offline-test",
    objective: "verify mocked Orbit request",
    constraints: ["no real network"],
  },
  role: "reasoning",
  context: { testMode: true },
};

function makeProvider() {
  return new OrbitProvider("orbit-test", {
    baseUrl: "https://orbit.invalid/",
    apiKey: "test-only-not-a-secret",
    model: "offline-fixture",
  });
}

test("Orbit provider sends the expected request and parses a successful response", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({
      model: "offline-fixture",
      choices: [{ message: { content: "mocked answer" } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await makeProvider().execute(input);

  assert.equal(captured.url, "https://orbit.invalid/chat/completions");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.authorization, "Bearer test-only-not-a-secret");
  assert.equal(captured.options.headers["content-type"], "application/json");

  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, "offline-fixture");
  assert.equal(body.messages[1].role, "user");
  assert.match(body.messages[1].content, /verify mocked Orbit request/);
  assert.equal(result.output, "mocked answer");
  assert.equal(result.capabilityId, "orbit:orbit-test:reasoning");
  assert.equal(result.evidence[0].status, "OBSERVED");
});

test("Orbit provider reports HTTP errors without live credits", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: "fixture payment required" } }),
    { status: 402, headers: { "content-type": "application/json" } },
  );
  await assert.rejects(makeProvider().execute(input), /Orbit inference failed: HTTP 402/);
});

test("Orbit provider rejects a successful response with no model output", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(
    JSON.stringify({ choices: [{ message: { content: "" } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
  await assert.rejects(makeProvider().execute(input), /Orbit inference returned no model output/);
});
