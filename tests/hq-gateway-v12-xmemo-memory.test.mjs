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
  assert.deepEqual(await client.recall("query", userA, { consent: true }), { status: "not_consented", context: "" });
  assert.equal(await client.store("task", "answer", userA, "research", { consent: true }), "not_consented");
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
