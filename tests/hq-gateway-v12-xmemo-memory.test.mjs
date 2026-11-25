import test from "node:test";
import assert from "node:assert/strict";
import { createXMemoMemoryClient, memoryPathForUser, redactForMemory } from "../supabase/functions/hq-gateway-v12/xmemo-memory.mjs";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

test("memory paths require a UUID and are isolated by authenticated user ID", () => {
  assert.equal(memoryPathForUser(userA), "projects/jarvis-x-hq/users/" + userA + "/conversations");
  assert.notEqual(memoryPathForUser(userA), memoryPathForUser(userB));
  assert.throws(() => memoryPathForUser("../other-user"), /xmemo_user_id_invalid/);
});

test("redaction removes common credential and email patterns before transport", () => {
  const value = "email person@example.com token sk-abcdefghijklmnopqrstuvwxyz password=supersecret";
  const redacted = redactForMemory(value);
  assert.doesNotMatch(redacted, /person@example\.com|sk-abcdefghijklmnopqrstuvwxyz|supersecret/);
  assert.match(redacted, /REDACTED_EMAIL/);
  assert.match(redacted, /REDACTED_SECRET/);
  assert.match(redacted, /REDACTED_CREDENTIAL/);
});


test("adapter independently enforces per-call consent with zero transport calls", async () => {
  let calls = 0;
  const client = createXMemoMemoryClient({
    apiKey: "test-key",
    fetchImpl: async () => { calls++; throw new Error("consent gate failed"); },
  });
  assert.deepEqual(await client.recall("query", userA, { consent: false }), { status: "not_consented", context: "" });
  assert.equal(await client.store("task", "answer", userA, "research", { consent: false }), "not_consented");
  assert.equal(calls, 0);
  assert.deepEqual(await client.recall("query", userA, { consent: false }), { status: "not_consented", context: "" });
  assert.equal(await client.store("task", "answer", userA, "research", { consent: false }), "not_consented");
  assert.equal(calls, 0);
});

test("missing key and invalid account context fail closed without network calls", async () => {
  let calls = 0;
  const client = createXMemoMemoryClient({ fetchImpl: async () => { calls++; throw new Error("unexpected"); } });
  assert.deepEqual(await client.recall("query", userA, { consent: true }), { status: "not_configured", context: "" });
  assert.equal(await client.store("task", "answer", userA, "research", { consent: true }), "not_configured");
  const configured = createXMemoMemoryClient({ apiKey: "test-only", fetchImpl: async () => { calls++; throw new Error("unexpected"); } });
  assert.deepEqual(await configured.recall("query", "../other-user", { consent: true }), { status: "invalid_user", context: "" });
  assert.equal(await configured.store("task", "answer", "../other-user", "research", { consent: true }), "invalid_user");
  assert.equal(calls, 0);
});

test("recall sends bounded redacted query and user-scoped path with no-store headers", async () => {
  let captured;
  const client = createXMemoMemoryClient({
    apiKey: "test-key",
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ context_text: "Relevant prior decision" }), { status: 200 });
    },
  });
  const result = await client.recall("Find note for person@example.com with key sk-abcdefghijklmnopqrstuvwxyz", userA, { consent: true });
  assert.deepEqual(result, { status: "recalled", context: "Relevant prior decision" });
  assert.equal(captured.url, "https://xmemo.dev/v1/recall/context");
  assert.equal(captured.body.path, memoryPathForUser(userA));
  assert.doesNotMatch(captured.body.query, /person@example\.com|sk-abcdefghijklmnopqrstuvwxyz/);
  assert.equal(captured.body.max_items, 6);
  assert.equal(captured.body.max_tokens, 1200);
  assert.equal(captured.init.headers["Cache-Control"], "no-store");
  assert.equal(captured.init.headers["X-API-Key"], "test-key");
});

test("recall bounds returned context and distinguishes empty, unavailable, and malformed responses", async () => {
  const long = "x".repeat(9000);
  const ok = createXMemoMemoryClient({ apiKey: "test", fetchImpl: async () => new Response(JSON.stringify({ context_text: long }), { status: 200 }) });
  const empty = createXMemoMemoryClient({ apiKey: "test", fetchImpl: async () => new Response("{}", { status: 200 }) });
  const bad = createXMemoMemoryClient({ apiKey: "test", fetchImpl: async () => new Response("no", { status: 503 }) });
  const malformed = createXMemoMemoryClient({ apiKey: "test", fetchImpl: async () => new Response("not-json", { status: 200 }) });
  assert.equal((await ok.recall("query", userA, { consent: true })).context.length, 8000);
  assert.deepEqual(await empty.recall("query", userA, { consent: true }), { status: "empty", context: "" });
  assert.deepEqual(await bad.recall("query", userA, { consent: true }), { status: "unavailable", context: "" });
  assert.deepEqual(await malformed.recall("query", userA, { consent: true }), { status: "empty", context: "" });
});

test("store sends redacted, bounded content to the authenticated user's path", async () => {
  let captured;
  const client = createXMemoMemoryClient({
    apiKey: "test-key",
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return new Response("{}", { status: 200 });
    },
  });
  const status = await client.store("Contact person@example.com", "Use key sk-abcdefghijklmnopqrstuvwxyz password=supersecret", userB, "research", { consent: true });
  assert.equal(status, "stored");
  assert.equal(captured.url, "https://xmemo.dev/v1/remember");
  assert.equal(captured.body.path, memoryPathForUser(userB));
  assert.doesNotMatch(captured.body.content, /person@example\.com|sk-abcdefghijklmnopqrstuvwxyz|supersecret/);
  assert.equal(captured.body.dedupe, true);
  assert.equal(captured.body.metadata.kind, "conversation_turn");
});

test("store fails closed on HTTP and transport errors", async () => {
  const bad = createXMemoMemoryClient({ apiKey: "test", fetchImpl: async () => new Response("no", { status: 500 }) });
  const network = createXMemoMemoryClient({ apiKey: "test", fetchImpl: async () => { throw new Error("private transport detail"); } });
  assert.equal(await bad.store("task", "answer", userA, "research", { consent: true }), "failed");
  assert.equal(await network.store("task", "answer", userA, "research", { consent: true }), "failed");
});

test("adapter requires a bounded timeout", () => {
  assert.throws(() => createXMemoMemoryClient({ timeoutMs: 10 }), /xmemo_timeout_invalid/);
  assert.throws(() => createXMemoMemoryClient({ fetchImpl: null }), /xmemo_fetch_required/);
});


test("gateway wires encrypted XMemo OAuth MCP through authenticated identity and explicit per-request consent", async () => {
  const { readFile } = await import("node:fs/promises");
  const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");
  const readiness = await readFile(new URL("../supabase/functions/hq-gateway-v12/memory-readiness.mjs", import.meta.url), "utf8");
  assert.match(gateway, /createXMemoOAuthRouter\(\)/);
  assert.match(gateway, /\/auth\/xmemo\/start/);
  assert.match(gateway, /\/auth\/xmemo\/callback/);
  assert.match(gateway, /Prefer authenticated OAuth MCP/);
  assert.match(gateway, /const memoryConsent = body\.memory_consent === true/);
  assert.match(gateway, /recallMemory\(task, user\.id, memoryConsent\)/);
  assert.match(gateway, /storeConversationMemory\(task, result\.answer, user\.id, taskType, memoryConsent\)/);
  assert.match(gateway, /memoryProvider: "xmemo-mcp-oauth-preferred"/);
  assert.match(gateway, /resolveMemoryReadiness/);
  assert.match(readiness, /memoryOAuthConfigured/);
  assert.match(readiness, /memoryLegacyFallbackConfigured/);
  assert.match(gateway, /createXMemoMemoryClient/);
  assert.match(gateway, /XMEMO_API_KEY/);
  assert.match(gateway, /result\.status === "not_connected"[\s\S]*xmemoLegacyMemory/);
});


test("OAuth discovery rejects non-allowlisted issuers before any request to their host", async () => {
  const { discoverXMemoOAuth } = await import("../supabase/functions/hq-gateway-v12/xmemo-oauth-discovery.mjs");
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("oauth-protected-resource")) {
      return new Response(JSON.stringify({
        resource: "https://xmemo.dev/mcp",
        authorization_servers: ["https://attacker.example"],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error("unexpected external metadata request");
  };
  await assert.rejects(
    () => discoverXMemoOAuth({ fetchImpl }),
    /oauth_issuer_host_not_allowed/
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith("https://xmemo.dev/"));
});

test("OAuth discovery accepts only the default exact XMemo issuer host", async () => {
  const { discoverXMemoOAuth } = await import("../supabase/functions/hq-gateway-v12/xmemo-oauth-discovery.mjs");
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("oauth-protected-resource")) {
      return new Response(JSON.stringify({
        resource: "https://xmemo.dev/mcp",
        authorization_servers: ["https://xmemo.dev"],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      issuer: "https://xmemo.dev",
      authorization_endpoint: "https://xmemo.dev/oauth/authorize",
      token_endpoint: "https://xmemo.dev/oauth/token",
      registration_endpoint: "https://xmemo.dev/oauth/register",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code"],
      scopes_supported: ["memory:read", "memory:write"],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await discoverXMemoOAuth({ fetchImpl });
  assert.equal(result.issuer, "https://xmemo.dev/");
  assert.deepEqual(result.allowedIssuerHosts, ["xmemo.dev", "auth.xmemo.dev"]);
  assert.equal(calls.length, 2);
});

test("OAuth discovery rejects loopback, private IP, localhost, wildcard and empty allowlist entries", async () => {
  const { discoverXMemoOAuth } = await import("../supabase/functions/hq-gateway-v12/xmemo-oauth-discovery.mjs");
  for (const host of ["127.0.0.1", "10.0.0.2", "[::1]", "localhost", "*.example.com", ""]) {
    await assert.rejects(
      () => discoverXMemoOAuth({ allowedIssuerHosts: [host], fetchImpl: async () => { throw new Error("must not fetch"); } }),
      /oauth_issuer_allowlist_(invalid|empty)/
    );
  }
});

test("OAuth discovery rejects private, loopback and external issuer values before contacting them", async () => {
  const { discoverXMemoOAuth } = await import("../supabase/functions/hq-gateway-v12/xmemo-oauth-discovery.mjs");
  for (const issuer of ["https://127.0.0.1", "https://10.1.2.3", "https://localhost", "https://metadata.attacker.example"]) {
    let externalCalls = 0;
    const fetchImpl = async (url) => {
      if (String(url).includes("oauth-protected-resource")) {
        return new Response(JSON.stringify({ resource: "https://xmemo.dev/mcp", authorization_servers: [issuer] }), { status: 200 });
      }
      externalCalls++;
      throw new Error("must not fetch issuer metadata");
    };
    await assert.rejects(() => discoverXMemoOAuth({ fetchImpl }), /oauth_issuer_host_not_allowed/);
    assert.equal(externalCalls, 0);
  }
});

test("OAuth discovery rejects OAuth endpoints outside the exact issuer allowlist", async () => {
  const { discoverXMemoOAuth } = await import("../supabase/functions/hq-gateway-v12/xmemo-oauth-discovery.mjs");
  const fetchImpl = async (url) => {
    if (String(url).includes("oauth-protected-resource")) {
      return new Response(JSON.stringify({ resource: "https://xmemo.dev/mcp", authorization_servers: ["https://xmemo.dev"] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      issuer: "https://xmemo.dev",
      authorization_endpoint: "https://auth.attacker.example/authorize",
      token_endpoint: "https://xmemo.dev/oauth/token",
      registration_endpoint: "https://xmemo.dev/oauth/register",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code"],
      scopes_supported: ["memory:read", "memory:write"],
    }), { status: 200 });
  };
  await assert.rejects(() => discoverXMemoOAuth({ fetchImpl }), /oauth_authorization_endpoint_host_not_allowed/);
});


test("OAuth client boundary independently rejects endpoints outside the discovered hostname allowlist", async () => {
  const { registerXMemoOAuthClient } = await import("../supabase/functions/hq-gateway-v12/xmemo-oauth-client.mjs");
  const metadata = {
    resource: "https://xmemo.dev/mcp",
    issuer: "https://xmemo.dev/",
    authorizationEndpoint: "https://auth.attacker.example/authorize",
    tokenEndpoint: "https://xmemo.dev/oauth/token",
    registrationEndpoint: "https://xmemo.dev/oauth/register",
    allowedIssuerHosts: ["xmemo.dev"],
    supportsS256: true,
    supportsAuthorizationCode: true,
    requiredScopesAvailable: true,
  };
  let calls = 0;
  await assert.rejects(
    () => registerXMemoOAuthClient({
      metadata,
      redirectUri: "https://sampasonko2011-blip.github.io/JARVIS-X/hq/xmemo-oauth-callback.html",
      fetchImpl: async () => { calls++; throw new Error("must not contact registration endpoint"); },
    }),
    /oauth_authorization_endpoint_host_not_allowed/
  );
  assert.equal(calls, 0);
});
