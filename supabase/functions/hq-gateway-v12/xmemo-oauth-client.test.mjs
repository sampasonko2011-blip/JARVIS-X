import test from "node:test";
import assert from "node:assert/strict";
import {
  registerXMemoOAuthClient,
  buildXMemoAuthorizationUrl,
  exchangeXMemoAuthorizationCode,
  refreshXMemoAccessToken,
} from "./xmemo-oauth-client.mjs";

const metadata = {
  resource: "https://xmemo.dev/mcp",
  issuer: "https://auth.xmemo.dev",
  registrationEndpoint: "https://auth.xmemo.dev/register",
  authorizationEndpoint: "https://auth.xmemo.dev/authorize",
  tokenEndpoint: "https://auth.xmemo.dev/token",
  supportsS256: true,
  supportsAuthorizationCode: true,
  requiredScopesAvailable: true,
};
const redirectUri = "https://sampasonko2011-blip.github.io/JARVIS-X/hq/xmemo-oauth-callback.html";
const pkce = { method: "S256", challenge: "A".repeat(43), state: "B".repeat(43) };

function fakeFetch(responseValue, capture = {}) {
  return async (url, options) => {
    capture.url = url;
    capture.options = options;
    return new Response(JSON.stringify(responseValue), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

test("registers a public PKCE client with the exact callback and scopes", async () => {
  const capture = {};
  const result = await registerXMemoOAuthClient({
    metadata, redirectUri, fetchImpl: fakeFetch({
      client_id: "jx-public-client",
      token_endpoint_auth_method: "none",
      redirect_uris: [redirectUri],
    }, capture),
  });
  assert.equal(result.clientId, "jx-public-client");
  const payload = JSON.parse(capture.options.body);
  assert.deepEqual(payload.redirect_uris, [redirectUri]);
  assert.equal(payload.token_endpoint_auth_method, "none");
  assert.equal(payload.scope, "memory:read memory:write");
});

test("builds an authorization URL with PKCE, state, resource and scopes", () => {
  const url = new URL(buildXMemoAuthorizationUrl({ metadata, clientId: "jx-public-client", redirectUri, pkce }));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), pkce.challenge);
  assert.equal(url.searchParams.get("state"), pkce.state);
  assert.equal(url.searchParams.get("resource"), metadata.resource);
  assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
});

test("exchanges authorization code without a client secret", async () => {
  const capture = {};
  const result = await exchangeXMemoAuthorizationCode({
    metadata, clientId: "jx-public-client", redirectUri,
    code: "one-time-code", verifier: "v".repeat(43),
    fetchImpl: fakeFetch({ access_token: "access", refresh_token: "refresh", token_type: "Bearer", expires_in: 3600 }, capture),
  });
  assert.equal(result.accessToken, "access");
  assert.equal(result.refreshToken, "refresh");
  assert.equal(capture.options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(capture.options.body.get("client_secret"), null);
  assert.equal(capture.options.body.get("code_verifier"), "v".repeat(43));
});

test("refreshes tokens and preserves old refresh token if rotation is omitted", async () => {
  const result = await refreshXMemoAccessToken({
    metadata, clientId: "jx-public-client", refreshToken: "old-refresh",
    fetchImpl: fakeFetch({ access_token: "new-access", token_type: "Bearer", expires_in: 1800 }),
  });
  assert.equal(result.accessToken, "new-access");
  assert.equal(result.refreshToken, "old-refresh");
});

test("fails closed when DCR, PKCE, or scopes are not confirmed", async () => {
  await assert.rejects(registerXMemoOAuthClient({
    metadata: { ...metadata, registrationEndpoint: null }, redirectUri, fetchImpl: fakeFetch({}),
  }), /oauth_dynamic_registration_unavailable/);
  await assert.rejects(buildXMemoAuthorizationUrl({
    metadata: { ...metadata, supportsS256: false }, clientId: "x", redirectUri, pkce,
  }), /oauth_pkce_s256_required/);
  await assert.rejects(registerXMemoOAuthClient({
    metadata: { ...metadata, requiredScopesAvailable: null }, redirectUri, fetchImpl: fakeFetch({}),
  }), /oauth_required_scopes_unconfirmed/);
});

test("rejects redirect URIs that are not HTTPS or contain query state", async () => {
  await assert.rejects(registerXMemoOAuthClient({
    metadata, redirectUri: "http://example.com/callback", fetchImpl: fakeFetch({}),
  }), /oauth_redirect_uri_must_be_https/);
  await assert.rejects(buildXMemoAuthorizationUrl({
    metadata, clientId: "x", redirectUri: "https://example.com/callback?x=1", pkce,
  }), /oauth_redirect_uri_query_or_fragment_forbidden/);
});
