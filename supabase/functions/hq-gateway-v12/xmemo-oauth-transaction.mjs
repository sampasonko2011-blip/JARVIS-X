const RESOURCE = "https://xmemo.dev/mcp";
const REQUIRED_SCOPES = ["memory:read", "memory:write"];
const DEFAULT_TTL_SECONDS = 600;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("oauth_state_invalid");
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("oauth_crypto_unavailable");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

function assertUserId(userId) {
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("oauth_authenticated_user_required");
  }
}

function assertRedirectUri(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("oauth_redirect_uri_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("oauth_redirect_uri_invalid");
  }
  return url.href;
}

function assertDependencies({ transactionStore, credentialStore, cryptoBox, exchangeCode, now, randomBytes }) {
  if (!transactionStore || typeof transactionStore.insert !== "function" ||
      typeof transactionStore.consume !== "function") throw new TypeError("oauth_atomic_transaction_store_required");
  if (!credentialStore || typeof credentialStore.saveEncrypted !== "function") {
    throw new TypeError("oauth_encrypted_credential_store_required");
  }
  if (!cryptoBox || typeof cryptoBox.seal !== "function" || typeof cryptoBox.open !== "function") {
    throw new TypeError("oauth_envelope_crypto_required");
  }
  if (typeof exchangeCode !== "function") throw new TypeError("oauth_code_exchange_required");
  if (typeof now !== "function" || typeof randomBytes !== "function") {
    throw new TypeError("oauth_deterministic_runtime_dependencies_required");
  }
}

/**
 * Server-side OAuth transaction coordinator.
 *
 * transactionStore.insert must enforce unique state_hash.
 * transactionStore.consume must atomically delete/mark-consumed exactly one
 * unexpired row matching both state_hash and authenticated user_id, returning
 * the row once only. Implement it with a single SQL UPDATE/DELETE ... RETURNING.
 * credentialStore.saveEncrypted must encrypt access/refresh tokens before storage.
 * cryptoBox must use authenticated encryption (AES-GCM or equivalent) with
 * user-bound associated data; never store raw verifier or provider tokens.
 */
export function createXMemoOAuthTransactionCoordinator(dependencies) {
  const {
    transactionStore, credentialStore, cryptoBox, exchangeCode,
    now = () => Date.now(),
    randomBytes = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
    ttlSeconds = DEFAULT_TTL_SECONDS,
  } = dependencies ?? {};
  assertDependencies({ transactionStore, credentialStore, cryptoBox, exchangeCode, now, randomBytes });
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 900) {
    throw new TypeError("oauth_transaction_ttl_invalid");
  }

  async function begin({ userId, clientId, redirectUri }) {
    assertUserId(userId);
    if (typeof clientId !== "string" || !clientId.trim() || clientId.length > 256) {
      throw new Error("oauth_client_id_invalid");
    }
    const callback = assertRedirectUri(redirectUri);
    const state = base64url(randomBytes(32));
    const verifier = base64url(randomBytes(32));
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) {
      throw new Error("oauth_randomness_invalid");
    }
    const stateHash = await sha256(state);
    const challenge = await sha256(verifier);
    const encryptedVerifier = await cryptoBox.seal(userId, verifier);
    if (typeof encryptedVerifier !== "string" || !encryptedVerifier) {
      throw new Error("oauth_verifier_encryption_failed");
    }
    const createdAt = now();
    if (!Number.isFinite(createdAt)) throw new Error("oauth_clock_invalid");
    await transactionStore.insert({
      state_hash: stateHash,
      user_id: userId,
      client_id: clientId,
      redirect_uri: callback,
      resource: RESOURCE,
      scopes: REQUIRED_SCOPES,
      encrypted_code_verifier: encryptedVerifier,
      created_at: new Date(createdAt).toISOString(),
      expires_at: new Date(createdAt + ttlSeconds * 1000).toISOString(),
    });
    return Object.freeze({
      state,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      expiresIn: ttlSeconds,
      resource: RESOURCE,
      scopes: REQUIRED_SCOPES,
    });
  }

  async function complete({ userId, state, code }) {
    assertUserId(userId);
    if (typeof code !== "string" || !code.trim() || code.length > 4096) {
      throw new Error("oauth_authorization_code_invalid");
    }
    const stateBytes = decodeBase64url(state);
    if (stateBytes.byteLength !== 32) throw new Error("oauth_state_invalid");
    const stateHash = await sha256(state);
    // This operation must be atomic and single-use in the backing database.
    const transaction = await transactionStore.consume({
      state_hash: stateHash,
      user_id: userId,
      now: new Date(now()).toISOString(),
    });
    if (!transaction) throw new Error("oauth_transaction_missing_expired_or_replayed");
    if (transaction.user_id !== userId || transaction.resource !== RESOURCE ||
        transaction.client_id == null || transaction.redirect_uri == null ||
        transaction.scopes?.join(" ") !== REQUIRED_SCOPES.join(" ")) {
      throw new Error("oauth_transaction_binding_invalid");
    }
    const verifier = await cryptoBox.open(userId, transaction.encrypted_code_verifier);
    if (typeof verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) {
      throw new Error("oauth_verifier_decryption_failed");
    }
    const tokens = await exchangeCode({
      clientId: transaction.client_id,
      redirectUri: transaction.redirect_uri,
      code,
      verifier,
      resource: RESOURCE,
      scopes: REQUIRED_SCOPES,
    });
    if (!tokens || typeof tokens.accessToken !== "string" || !tokens.accessToken ||
        typeof tokens.refreshToken !== "string" || !tokens.refreshToken ||
        !Number.isFinite(tokens.expiresIn) || tokens.expiresIn <= 0) {
      throw new Error("oauth_token_set_invalid");
    }
    await credentialStore.saveEncrypted({
      userId,
      clientId: transaction.client_id,
      resource: RESOURCE,
      scopes: REQUIRED_SCOPES,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(now() + tokens.expiresIn * 1000).toISOString(),
    });
    return Object.freeze({ connected: true, scopes: REQUIRED_SCOPES, resource: RESOURCE });
  }

  return Object.freeze({ begin, complete });
}

export { REQUIRED_SCOPES as XMEMO_REQUIRED_SCOPES, RESOURCE as XMEMO_RESOURCE };
