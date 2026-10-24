import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createGatewayHandler } from "../server/gateway-handler.mjs";

const ORIGIN = "http://127.0.0.1";
async function withServer(options, run) {
  const server = createServer(createGatewayHandler({
    runtime: { run: async () => ({
      status: "COMPLETED",
      answer: "Verified synthesis",
      providerCalls: 3,
      traceId: "trace-test",
      composite: { status: "EXECUTED_NOT_QUALITY_PROMOTED" },
    }) },
    authenticateRequest: async req => req.headers.authorization === "Bearer valid-test-token"
      ? { id: "test-user" } : null,
    allowedOrigin: ORIGIN,
    ...options,
  }));
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", error => error ? reject(error) : resolve()));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function headers(auth = true) {
  return {
    origin: ORIGIN,
    ...(auth ? { authorization: "Bearer valid-test-token" } : {}),
  };
}

test("health is explicit and does not claim authentication without a valid session", async () => {
  await withServer({}, async base => {
    const anon = await fetch(base + "/api/v1/health", { headers: headers(false) });
    assert.equal(anon.status, 200);
    assert.equal((await anon.json()).authenticated, false);
    const auth = await fetch(base + "/api/v1/health", { headers: headers() });
    const body = await auth.json();
    assert.equal(body.status, "ok");
    assert.equal(body.authenticated, true);
    assert.equal(body.chat_enabled, true);
  });
});

test("chat requires an authenticated principal and an allowed origin", async () => {
  await withServer({}, async base => {
    const unauth = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(false), "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    assert.equal(unauth.status, 401);
    const badOrigin = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), origin: "https://attacker.invalid", "content-type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    assert.equal(badOrigin.status, 403);
  });
});

test("chat returns only a completed, non-quality-promoted synthesis", async () => {
  await withServer({}, async base => {
    const response = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ message: "Test objective", conversation_id: "local-1" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reply, "Verified synthesis");
    assert.equal(body.execution.qualityStatus, "EXECUTED_NOT_QUALITY_PROMOTED");
    assert.equal(body.execution.traceId, "trace-test");
  });
});

test("manual handoff and runtime errors never become fake assistant replies", async () => {
  await withServer({
    runtime: { run: async () => ({ status: "MANUAL_HANDOFF", reason: "COMPOSITE_NOT_READY" }) },
  }, async base => {
    const response = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ message: "Must not fake a reply" }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "EXECUTION_NOT_VERIFIED");
  });
  await withServer({
    runtime: { run: async () => { throw new Error("secret-bearing upstream error"); } },
  }, async base => {
    const response = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ message: "Fail safely" }),
    });
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes("secret-bearing"), false);
  });
});

test("rejects malformed, non-JSON, oversized and invalid messages", async () => {
  await withServer({ maxBodyBytes: 64, maxMessageChars: 20 }, async base => {
    const badType = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), "content-type": "text/plain" }, body: "hello",
    });
    assert.equal(badType.status, 415);
    const malformed = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), "content-type": "application/json" }, body: "{",
    });
    assert.equal(malformed.status, 400);
    const tooLong = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(21) }),
    });
    assert.equal(tooLong.status, 400);
    const oversized = await fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(100) }),
    });
    assert.equal(oversized.status, 413);
  });
});

test("rate limit is scoped to the authenticated principal", async () => {
  await withServer({ maxRequestsPerMinute: 1 }, async base => {
    const send = () => fetch(base + "/api/v1/chat", {
      method: "POST", headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ message: "one request" }),
    });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 429);
  });
});

test("rejects unsupported paths and methods", async () => {
  await withServer({}, async base => {
    assert.equal((await fetch(base + "/api/v1/unknown", { headers: headers() })).status, 404);
    assert.equal((await fetch(base + "/api/v1/chat", { headers: headers() })).status, 405);
  });
});
