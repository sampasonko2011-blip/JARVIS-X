import test from "node:test";
import assert from "node:assert/strict";
import { discoverXMemoOAuth } from "./xmemo-oauth-discovery.mjs";

const resourceMetadata = {
  resource: "https://xmemo.dev/mcp",
  authorization_servers: ["https://auth.xmemo.dev"],
};
const serverMetadata = {
  issuer: "https://auth.xmemo.dev",
  authorization_endpoint: "https://auth.xmemo.dev/authorize",
  token_endpoint: "https://auth.xmemo.dev/token",
  registration_endpoint: "https://auth.xmemo.dev/register",
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: ["memory:read", "memory:write"],
};

function fakeFetch(routes) {
  return async (url) => {
    const value = routes[url];
    return value
      ? new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response("not found", { status: 404 });
  };
}

test("discovers XMemo resource and authorization server metadata without credentials", async () => {
  const fetchImpl = fakeFetch({
    "https://xmemo.dev/.well-known/oauth-protected-resource/mcp": resourceMetadata,
    "https://auth.xmemo.dev/.well-known/oauth-authorization-server": serverMetadata,
  });
  const result = await discoverXMemoOAuth({ fetchImpl });
  assert.equal(result.resource, "https://xmemo.dev/mcp");
  assert.equal(result.supportsS256, true);
  assert.equal(result.registrationEndpoint, "https://auth.xmemo.dev/register");
  assert.equal(result.requiredScopesAvailable, true);
});

test("rejects a resource outside the reviewed XMemo MCP origin", async () => {
  await assert.rejects(
    discoverXMemoOAuth({ resource: "https://attacker.example/mcp", fetchImpl: fakeFetch({}) }),
    /oauth_resource_not_approved/,
  );
});

test("rejects resource metadata that points to a different resource", async () => {
  const fetchImpl = fakeFetch({
    "https://xmemo.dev/.well-known/oauth-protected-resource/mcp": {
      ...resourceMetadata,
      resource: "https://attacker.example/mcp",
    },
  });
  await assert.rejects(discoverXMemoOAuth({ fetchImpl }), /oauth_resource_metadata_mismatch/);
});

test("rejects ambiguous authorization server metadata", async () => {
  const fetchImpl = fakeFetch({
    "https://xmemo.dev/.well-known/oauth-protected-resource/mcp": {
      ...resourceMetadata,
      authorization_servers: ["https://auth.xmemo.dev", "https://other.example"],
    },
  });
  await assert.rejects(discoverXMemoOAuth({ fetchImpl }), /oauth_authorization_server_ambiguous/);
});

test("rejects issuer mismatch", async () => {
  const fetchImpl = fakeFetch({
    "https://xmemo.dev/.well-known/oauth-protected-resource/mcp": resourceMetadata,
    "https://auth.xmemo.dev/.well-known/oauth-authorization-server": {
      ...serverMetadata,
      issuer: "https://attacker.example",
    },
  });
  await assert.rejects(discoverXMemoOAuth({ fetchImpl }), /oauth_issuer_mismatch/);
});

test("reports missing PKCE S256 or required scopes instead of silently accepting", async () => {
  const fetchImpl = fakeFetch({
    "https://xmemo.dev/.well-known/oauth-protected-resource/mcp": resourceMetadata,
    "https://auth.xmemo.dev/.well-known/oauth-authorization-server": {
      ...serverMetadata,
      code_challenge_methods_supported: ["plain"],
      scopes_supported: ["memory:read"],
    },
  });
  const result = await discoverXMemoOAuth({ fetchImpl });
  assert.equal(result.supportsS256, false);
  assert.equal(result.requiredScopesAvailable, false);
});

test("preserves issuer path when constructing RFC 8414 metadata URL", async () => {
  const pathIssuerMetadata = {
    ...serverMetadata,
    issuer: "https://auth.xmemo.dev/tenant/alpha",
  };
  const fetchImpl = fakeFetch({
    "https://xmemo.dev/.well-known/oauth-protected-resource/mcp": {
      resource: "https://xmemo.dev/mcp",
      authorization_servers: ["https://auth.xmemo.dev/tenant/alpha"],
    },
    "https://auth.xmemo.dev/.well-known/oauth-authorization-server/tenant/alpha": pathIssuerMetadata,
  });
  const result = await discoverXMemoOAuth({ fetchImpl });
  assert.equal(result.issuer, "https://auth.xmemo.dev/tenant/alpha");
});
