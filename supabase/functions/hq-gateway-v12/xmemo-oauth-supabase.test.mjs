import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createXMemoOAuthSupabaseAdapters } from "./xmemo-oauth-supabase.mjs";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const otherUserId = "123e4567-e89b-42d3-a456-426614174001";
const key = Buffer.alloc(32, 7).toString("base64url");
const calls = [];

function fakeFetch(rows = []) {
  return async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("consume_hq_xmemo_oauth_transaction")) {
      return new Response(JSON.stringify(rows.shift() ?? []), { status: 200 });
    }
    return new Response(null, { status: 204 });
  };
}

test("AES-GCM envelope round trips and is bound to the user identity", async () => {
  const adapters = createXMemoOAuthSupabaseAdapters({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-test",
    encryptionKey: key,
    fetchImpl: fakeFetch(),
    cryptoImpl: webcrypto,
  });
  const envelope = await adapters.cryptoBox.seal(userId, "refresh-secret");
  assert.equal(await adapters.cryptoBox.open(userId, envelope), "refresh-secret");
  await assert.rejects(adapters.cryptoBox.open(otherUserId, envelope), /oauth_ciphertext_authentication_failed/);
  assert.equal(envelope.startsWith("v1."), true);
});

test("transaction insertion and consumption use service role and authenticated user binding", async () => {
  calls.length = 0;
  const adapters = createXMemoOAuthSupabaseAdapters({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-test",
    encryptionKey: key,
    fetchImpl: fakeFetch([{ user_id: userId, client_id: "jx-client", resource: "https://xmemo.dev/mcp" }]),
    cryptoImpl: webcrypto,
  });
  await adapters.transactionStore.insert({ user_id: userId, resource: "https://xmemo.dev/mcp" });
  const row = await adapters.transactionStore.consume({ state_hash: "A".repeat(43), user_id: userId, now: new Date().toISOString() });
  assert.equal(row.user_id, userId);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.headers.Authorization === "Bearer service-role-test"));
  assert.match(calls[1].url, /rpc\/consume_hq_xmemo_oauth_transaction/);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_state_hash: "A".repeat(43), p_user_id: userId, p_now: JSON.parse(calls[1].options.body).p_now,
  });
});

test("credential save encrypts both tokens and load decrypts them only for the same user", async () => {
  calls.length = 0;
  let stored;
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (options.method === "POST") {
      stored = JSON.parse(options.body);
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify([stored]), { status: 200 });
  };
  const adapters = createXMemoOAuthSupabaseAdapters({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-test",
    encryptionKey: key,
    fetchImpl,
    cryptoImpl: webcrypto,
  });
  await adapters.credentialStore.saveEncrypted({
    userId, clientId: "jx-client", resource: "https://xmemo.dev/mcp",
    scopes: ["memory:read", "memory:write"],
    accessToken: "access-secret", refreshToken: "refresh-secret",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.notEqual(stored.encrypted_access_token, "access-secret");
  assert.notEqual(stored.encrypted_refresh_token, "refresh-secret");
  const restored = await adapters.credentialStore.load(userId);
  assert.equal(restored.accessToken, "access-secret");
  assert.equal(restored.refreshToken, "refresh-secret");
  await assert.rejects(adapters.credentialStore.load(otherUserId), /oauth_ciphertext_authentication_failed/);
});

test("rejects missing keys and non-HTTPS Supabase origins", () => {
  assert.throws(() => createXMemoOAuthSupabaseAdapters({
    supabaseUrl: "http://project.supabase.co", serviceRoleKey: "service-role-test",
    encryptionKey: key, fetchImpl: fakeFetch(), cryptoImpl: webcrypto,
  }), /oauth_supabase_url_invalid/);
  assert.throws(() => createXMemoOAuthSupabaseAdapters({
    supabaseUrl: "https://project.supabase.co", serviceRoleKey: "service-role-test",
    encryptionKey: "", fetchImpl: fakeFetch(), cryptoImpl: webcrypto,
  }), /oauth_encryption_key_missing/);
});
