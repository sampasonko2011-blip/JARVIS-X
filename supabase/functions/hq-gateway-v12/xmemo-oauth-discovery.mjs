const DEFAULT_RESOURCE = "https://xmemo.dev/mcp";
const WELL_KNOWN = "/.well-known/";

function httpsUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + "_invalid_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(label + "_must_be_https");
  }
  return url;
}

function resourceMetadataUrls(resource) {
  const url = new URL(resource);
  const path = url.pathname.split("/").filter(Boolean).join("/");
  return path
    ? [new URL(WELL_KNOWN + "oauth-protected-resource/" + path, url.origin).href,
       new URL(WELL_KNOWN + "oauth-protected-resource", url.origin).href]
    : [new URL(WELL_KNOWN + "oauth-protected-resource", url.origin).href];
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("oauth_metadata_http_" + response.status);
  const value = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("oauth_metadata_invalid_json");
  }
  return value;
}

/**
 * Read-only OAuth discovery for XMemo's hosted MCP resource.
 * Does not register a client, authorize a user, exchange tokens, or persist secrets.
 * Registration and callback handling must only be added after reviewing the exact
 * XMemo metadata and client-registration contract.
 */
export async function discoverXMemoOAuth({
  resource = DEFAULT_RESOURCE,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("oauth_fetch_required");
  const resourceUrl = httpsUrl(resource, "oauth_resource");
  if (resourceUrl.origin !== "https://xmemo.dev" || resourceUrl.pathname !== "/mcp") {
    throw new Error("oauth_resource_not_approved");
  }

  let protectedResource;
  let lastError;
  for (const metadataUrl of resourceMetadataUrls(resourceUrl.href)) {
    try {
      protectedResource = await getJson(metadataUrl, fetchImpl);
      break;
    } catch (error) { lastError = error; }
  }
  if (!protectedResource) throw lastError ?? new Error("oauth_resource_metadata_unavailable");

  const metadataResource = httpsUrl(protectedResource.resource, "oauth_metadata_resource");
  if (metadataResource.href !== resourceUrl.href) {
    throw new Error("oauth_resource_metadata_mismatch");
  }
  const authorizationServers = protectedResource.authorization_servers;
  if (!Array.isArray(authorizationServers) || authorizationServers.length !== 1) {
    throw new Error("oauth_authorization_server_ambiguous");
  }
  const issuer = httpsUrl(authorizationServers[0], "oauth_issuer");
  const metadataCandidates = [
    new URL(WELL_KNOWN + "oauth-authorization-server", issuer.origin).href,
    new URL(WELL_KNOWN + "openid-configuration", issuer.origin).href,
  ];
  let authorizationServer;
  for (const metadataUrl of metadataCandidates) {
    try {
      authorizationServer = await getJson(metadataUrl, fetchImpl);
      break;
    } catch (error) { lastError = error; }
  }
  if (!authorizationServer) throw lastError ?? new Error("oauth_server_metadata_unavailable");

  const discoveredIssuer = httpsUrl(authorizationServer.issuer, "oauth_discovered_issuer");
  if (discoveredIssuer.href !== issuer.href) {
    throw new Error("oauth_issuer_mismatch");
  }
  const authorizationEndpoint = httpsUrl(authorizationServer.authorization_endpoint, "oauth_authorization_endpoint");
  const tokenEndpoint = httpsUrl(authorizationServer.token_endpoint, "oauth_token_endpoint");
  const registrationEndpoint = authorizationServer.registration_endpoint
    ? httpsUrl(authorizationServer.registration_endpoint, "oauth_registration_endpoint")
    : null;
  const scopes = Array.isArray(authorizationServer.scopes_supported)
    ? authorizationServer.scopes_supported.filter(x => typeof x === "string")
    : [];

  return Object.freeze({
    resource: resourceUrl.href,
    issuer: discoveredIssuer.href,
    authorizationEndpoint: authorizationEndpoint.href,
    tokenEndpoint: tokenEndpoint.href,
    registrationEndpoint: registrationEndpoint?.href ?? null,
    supportsS256: Array.isArray(authorizationServer.code_challenge_methods_supported)
      && authorizationServer.code_challenge_methods_supported.includes("S256"),
    supportsAuthorizationCode: Array.isArray(authorizationServer.grant_types_supported)
      ? authorizationServer.grant_types_supported.includes("authorization_code")
      : null,
    supportedScopes: scopes,
    requiredScopesAvailable: scopes.length === 0
      ? null
      : ["memory:read", "memory:write"].every(scope => scopes.includes(scope)),
  });
}
