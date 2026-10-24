import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseAuthenticator } from "../server/supabase-auth.mjs";

test("Supabase authenticator validates bearer tokens against Auth and returns the verified user ID", async () => {
  let observed;
  const authenticate = createSupabaseAuthenticator({
    supabaseUrl: "https://example.supabase.co/",
    anonKey: "test-publishable-key",
    fetchImpl: async (url, init) => {
      observed = { url, init };
      return new Response(JSON.stringify({ id: "verified-user-id", is_anonymous: false }), { status: 200 });
    },
  });
  const principal = await authenticate({ headers: { authorization: "Bearer session-access-token" } });
  assert.equal(principal.id, "verified-user-id");
  assert.equal(observed.url, "https://example.supabase.co/auth/v1/user");
  assert.equal(observed.init.headers.apikey, "test-publishable-key");
  assert.equal(observed.init.headers.authorization, "Bearer session-access-token");
});

test("missing, malformed, rejected and anonymous sessions fail closed", async () => {
  const authenticate = createSupabaseAuthenticator({
    supabaseUrl: "https://example.supabase.co",
    anonKey: "test-key",
    fetchImpl: async (_url, init) => init.headers.authorization.endsWith("rejected")
      ? new Response("{}", { status: 401 })
      : new Response(JSON.stringify({ id: "anonymous-id", is_anonymous: true }), { status: 200 }),
  });
  assert.equal(await authenticate({ headers: {} }), null);
  assert.equal(await authenticate({ headers: { authorization: "Basic nope" } }), null);
  assert.equal(await authenticate({ headers: { authorization: "Bearer rejected" } }), null);
  assert.equal(await authenticate({ headers: { authorization: "Bearer anonymous" } }), null);
});

test("refuses invalid or insecure remote Supabase configuration", () => {
  assert.throws(() => createSupabaseAuthenticator({ supabaseUrl: "http://auth.example.com", anonKey: "key" }), /SUPABASE_URL_INVALID/);
  assert.throws(() => createSupabaseAuthenticator({ supabaseUrl: "https://example.supabase.co", anonKey: "" }), /SUPABASE_AUTH_CONFIGURATION_INVALID/);
});
