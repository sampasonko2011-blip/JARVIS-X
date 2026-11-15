const DEFAULT_RESOURCE = "https://xmemo.dev/mcp";
const DEFAULT_ISSUER_HOSTS = Object.freeze(["xmemo.dev"]);
const WELL_KNOWN = "/.well-known/";

function httpsUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + "_invalid_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port) {
    throw new Error(label + "_must_be_https");
  }
  return url;
}

function normalizeAllowedHosts(value) {
  const entries = value === undefined || value === null
    ? [...DEFAULT_ISSUER_HOSTS]
    : Array.isArray(value) ? value
    : typeof value === "string" ? value.split(",")
    : null;
  if (!entries || entries.length > 20) throw new Error("oauth_issuer_allowlist_invalid");
  const hosts = [];
  for (const entry of entries) {
    if (typeof entry !== "string") throw new Error("oauth_issuer_allowlist_invalid");
    const host = entry.trim().toLowerCase().replace(/\\.$/, "");
    // Exact DNS names only: no wildcards, ports, URL fragments, IP literals,
    // localhost, single-label hosts, or private-use suffixes.
    if (!host || host.length > 253 ||
        !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$/.test(host) ||
        /^(?:localhost|.*\\.(?:localhost|local|internal|test|invalid|example))$/.test(host) ||
        /^[0-9.]+$/.test(host)) {
      throw new Error("oauth_issuer_allowlist_invalid");
    }
    if (!hosts.includes(host)) hosts.push(host);
  }
  if (!hosts.length) throw new Error("oauth_issuer_allowlist_empty");
  return Object.freeze(hosts);
}

function allowlistedHttpsUrl(value, label, allowedHosts) {
  const url = httpsUrl(value, label);
  const hostname = url.hostname.toLowerCase().replace(/\\.$/, "");
  if (hostname.includes(":") || /^[0-9.]+$/.test(hostname) || !allowedHosts.includes(hostname)) {
    throw new Error(label + "_host_not_allowed");
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
 * Read-only OAuth discovery for XMemo's fixed hosted MCP resource.
 * Issuers and every discovered OAuth endpoint must use an exact, explicitly
 * trusted HTTPS hostname. Extra hosts must be configured server-side through
 * XMEMO_ALLOWED_ISSUER_HOSTS; wildcard and IP entries are deliberately rejected.
 */
export async function discoverXMemoOAuth({
  resource = DEFAULT_RESOURCE,
  allowedIssuerHosts,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("oauth_fetch_required");
  const allowedHosts = normalizeAllowedHosts(allowedIssuerHosts);
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

  // Validate the issuer host BEFORE constructing or fetching its metadata URL.
  const issuer = allowlistedHttpsUrl(authorizationServers[0], "oauth_issuer", allowedHosts);
  const issuerPath = issuer.pathname.replace(/^\\/+|\\/+$/g, "");
  const metadataCandidates = [
    new URL(WELL_KNOWN + "oauth-authorization-server" + (issuerPath ? "/" + issuerPath : ""), issuer.origin).href,
    new URL(WELL_KNOWN + "openid-configuration" + (issuerPath ? "/" + issuerPath : ""), issuer.origin).href,
  ];
  let authorizationServer;
  for (const metadataUrl of metadataCandidates) {
    try {
      authorizationServer = await getJson(metadataUrl, fetchImpl);
      break;
    } catch (error) { lastError = error; }
  }
  if (!authorizationServer) throw lastError ?? new Error("oauth_server_metadata_unavailable");

  const discoveredIssuer = allowlistedHttpsUrl(authorizationServer.issuer, "oauth_discovered_issuer", allowedHosts);
  if (discoveredIssuer.href !== issuer.href) throw new Error("oauth_issuer_mismatch");
  const authorizationEndpoint = allowlistedHttpsUrl(authorizationServer.authorization_endpoint, "oauth_authorization_endpoint", allowedHosts);
  const tokenEndpoint = allowlistedHttpsUrl(authorizationServer.token_endpoint, "oauth_token_endpoint", allowedHosts);
  const registrationEndpoint = authorizationServer.registration_endpoint
    ? allowlistedHttpsUrl(authorizationServer.registration_endpoint, "oauth_registration_endpoint", allowedHosts)
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
    allowedIssuerHosts: allowedHosts,
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
