const REQUIRED_SCOPES = ["memory:read", "memory:write"];
const RESOURCE = "https://xmemo.dev/mcp";

function requireHttps(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + "_invalid_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(label + "_must_be_https");
  }
  return url;
}

function requireMetadata(metadata) {
  if (!metadata || metadata.resource !== RESOURCE) throw new Error("oauth_resource_not_approved");
  const issuer = requireHttps(metadata.issuer, "oauth_issuer");
  const registrationEndpoint = metadata.registrationEndpoint
    ? requireHttps(metadata.registrationEndpoint, "oauth_registration_endpoint")
    : null;
  const authorizationEndpoint = requireHttps(metadata.authorizationEndpoint, "oauth_authorization_endpoint");
  const tokenEndpoint = requireHttps(metadata.tokenEndpoint, "oauth_token_endpoint");
  if (registrationEndpoint && registrationEndpoint.origin !== issuer.origin) {
    throw new Error("oauth_registration_origin_mismatch");
  }
  if (metadata.supportsS256 !== true) throw new Error("oauth_pkce_s256_required");
  if (metadata.supportsAuthorizationCode !== true) throw new Error("oauth_authorization_code_required");
  if (metadata.requiredScopesAvailable !== true) throw new Error("oauth_required_scopes_unconfirmed");
  return { issuer, registrationEndpoint, authorizationEndpoint, tokenEndpoint };
}

function validateRedirectUri(value) {
  const url = requireHttps(value, "oauth_redirect_uri");
  if (url.search || url.hash) throw new Error("oauth_redirect_uri_query_or_fragment_forbidden");
  return url.href;
}

async function readJsonResponse(response, prefix) {
  if (!response.ok) throw new Error(prefix + "_http_" + response.status);
  const value = await response.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(prefix + "_invalid_json");
  }
  return value;
}

/** Register a public PKCE client. Caller must persist only the non-secret client_id. */
export async function registerXMemoOAuthClient({
  metadata,
  redirectUri,
  clientName = "JARVIS-X HQ",
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoints = requireMetadata(metadata);
  if (!endpoints.registrationEndpoint) throw new Error("oauth_dynamic_registration_unavailable");
  if (typeof fetchImpl !== "function") throw new TypeError("oauth_fetch_required");
  const callback = validateRedirectUri(redirectUri);
  if (typeof clientName !== "string" || !clientName.trim() || clientName.length > 100) {
    throw new Error("oauth_client_name_invalid");
  }
  const response = await fetchImpl(endpoints.registrationEndpoint.href, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: clientName.trim(),
      redirect_uris: [callback],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: REQUIRED_SCOPES.join(" "),
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const result = await readJsonResponse(response, "oauth_registration");
  if (typeof result.client_id !== "string" || !result.client_id.trim() ||
      result.token_endpoint_auth_method !== "none" ||
      !Array.isArray(result.redirect_uris) || !result.redirect_uris.includes(callback)) {
    throw new Error("oauth_registration_response_invalid");
  }
  return Object.freeze({
    clientId: result.client_id,
    redirectUri: callback,
    scopes: REQUIRED_SCOPES,
  });
}

/** Build the browser authorization URL; PKCE verifier and state remain caller-owned. */
export function buildXMemoAuthorizationUrl({
  metadata,
  clientId,
  redirectUri,
  pkce,
} = {}) {
  const endpoints = requireMetadata(metadata);
  const callback = validateRedirectUri(redirectUri);
  if (typeof clientId !== "string" || !clientId.trim()) throw new Error("oauth_client_id_required");
  if (!pkce || pkce.method !== "S256" ||
      typeof pkce.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(pkce.challenge) ||
      typeof pkce.state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(pkce.state)) {
    throw new Error("oauth_pkce_material_invalid");
  }
  const url = new URL(endpoints.authorizationEndpoint.href);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("scope", REQUIRED_SCOPES.join(" "));
  url.searchParams.set("resource", RESOURCE);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", pkce.state);
  return url.href;
}

/**
 * Exchange a validated authorization code. This function returns tokens only to
 * its caller; production callers must persist them server-side using authenticated,
 * encrypted, user-scoped storage and must never return refresh tokens to the browser.
 */
export async function exchangeXMemoAuthorizationCode({
  metadata,
  clientId,
  redirectUri,
  code,
  verifier,
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoints = requireMetadata(metadata);
  const callback = validateRedirectUri(redirectUri);
  if (typeof fetchImpl !== "function") throw new TypeError("oauth_fetch_required");
  if (typeof clientId !== "string" || !clientId.trim() ||
      typeof code !== "string" || !code.trim() || code.length > 4096 ||
      typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new Error("oauth_code_exchange_input_invalid");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: callback,
    code_verifier: verifier,
    resource: RESOURCE,
  });
  const response = await fetchImpl(endpoints.tokenEndpoint.href, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  const tokens = await readJsonResponse(response, "oauth_token_exchange");
  if (typeof tokens.access_token !== "string" || !tokens.access_token ||
      typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer" ||
      !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 ||
      (tokens.refresh_token !== undefined && typeof tokens.refresh_token !== "string")) {
    throw new Error("oauth_token_response_invalid");
  }
  return Object.freeze({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresIn: tokens.expires_in,
    scope: typeof tokens.scope === "string" ? tokens.scope : "",
  });
}

export async function refreshXMemoAccessToken({
  metadata,
  clientId,
  refreshToken,
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoints = requireMetadata(metadata);
  if (typeof fetchImpl !== "function") throw new TypeError("oauth_fetch_required");
  if (typeof clientId !== "string" || !clientId.trim() ||
      typeof refreshToken !== "string" || !refreshToken.trim()) {
    throw new Error("oauth_refresh_input_invalid");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
    resource: RESOURCE,
  });
  const response = await fetchImpl(endpoints.tokenEndpoint.href, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  const tokens = await readJsonResponse(response, "oauth_refresh");
  if (typeof tokens.access_token !== "string" || !tokens.access_token ||
      typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer" ||
      !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 ||
      (tokens.refresh_token !== undefined && typeof tokens.refresh_token !== "string")) {
    throw new Error("oauth_refresh_response_invalid");
  }
  return Object.freeze({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresIn: tokens.expires_in,
    scope: typeof tokens.scope === "string" ? tokens.scope : "",
  });
}
