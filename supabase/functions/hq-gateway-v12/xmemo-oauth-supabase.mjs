const RESOURCE = "https://xmemo.dev/mcp";
const KEY_VERSION = "v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("oauth_ciphertext_invalid");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeKey(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("oauth_encryption_key_missing");
  const trimmed = value.trim();
  // Prefer an explicitly base64url-encoded 32-byte key. Also accept a
  // password-manager-generated high-entropy secret of >=32 UTF-8 bytes;
  // longer values are reduced to a fixed 256-bit AES key with SHA-256.
  try {
    const decoded = decodeBase64Url(trimmed);
    if (decoded.byteLength === 32) return decoded;
  } catch { /* use raw secret material below */ }
  const raw = new TextEncoder().encode(trimmed);
  if (raw.byteLength < 32) throw new Error("oauth_encryption_key_invalid");
  return raw;
}

function assertUserId(userId) {
  if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) throw new Error("oauth_authenticated_user_required");
}

function assertConfig({ supabaseUrl, serviceRoleKey, encryptionKey, fetchImpl, cryptoImpl }) {
  let url;
  try { url = new URL(supabaseUrl); } catch { throw new Error("oauth_supabase_url_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("oauth_supabase_url_invalid");
  if (typeof serviceRoleKey !== "string" || !serviceRoleKey.trim()) throw new Error("oauth_service_role_missing");
  if (typeof fetchImpl !== "function" || !cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== "function") {
    throw new Error("oauth_runtime_crypto_or_fetch_missing");
  }
  return { url: url.origin, keyBytes: decodeKey(encryptionKey) };
}

/**
 * Supabase service-role adapters for the XMemo OAuth coordinator.
 * Only encrypted provider credentials/verifiers cross the PostgREST boundary.
 * The service-role credential and AES-256-GCM key must remain Edge Function secrets.
 */
export function createXMemoOAuthSupabaseAdapters({
  supabaseUrl,
  serviceRoleKey,
  encryptionKey,
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  now = () => Date.now(),
} = {}) {
  const config = assertConfig({ supabaseUrl, serviceRoleKey, encryptionKey, fetchImpl, cryptoImpl });
  const keyPromise = (async () => {
    const keyBytes = config.keyBytes.byteLength === 32
      ? config.keyBytes
      : new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", config.keyBytes));
    return await cryptoImpl.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  })();

  async function seal(userId, value) {
    assertUserId(userId);
    if (typeof value !== "string" || !value) throw new Error("oauth_plaintext_invalid");
    const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const key = await keyPromise;
    const additionalData = new TextEncoder().encode("jarvis-x:xmemo-oauth:" + KEY_VERSION + ":" + userId);
    const ciphertext = await cryptoImpl.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData, tagLength: 128 },
      key,
      new TextEncoder().encode(value),
    );
    return [KEY_VERSION, encodeBase64Url(iv), encodeBase64Url(new Uint8Array(ciphertext))].join(".");
  }

  async function open(userId, envelope) {
    assertUserId(userId);
    if (typeof envelope !== "string") throw new Error("oauth_ciphertext_invalid");
    const [version, ivPart, cipherPart, extra] = envelope.split(".");
    if (version !== KEY_VERSION || !ivPart || !cipherPart || extra !== undefined) throw new Error("oauth_ciphertext_version_invalid");
    const iv = decodeBase64Url(ivPart);
    const ciphertext = decodeBase64Url(cipherPart);
    if (iv.byteLength !== 12 || ciphertext.byteLength < 17 || ciphertext.byteLength > 20_000) {
      throw new Error("oauth_ciphertext_invalid");
    }
    const key = await keyPromise;
    const additionalData = new TextEncoder().encode("jarvis-x:xmemo-oauth:" + KEY_VERSION + ":" + userId);
    try {
      const plaintext = await cryptoImpl.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData, tagLength: 128 },
        key,
        ciphertext,
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      throw new Error("oauth_ciphertext_authentication_failed");
    }
  }

  async function request(path, { method = "GET", body, prefer } = {}) {
    const headers = {
      apikey: serviceRoleKey,
      Authorization: "Bearer " + serviceRoleKey,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const response = await fetchImpl(config.url + path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      await response.text().catch(() => "");
      throw new Error("oauth_storage_http_" + response.status);
    }
    if (response.status === 204) return null;
    return await response.json().catch(() => null);
  }

  const transactionStore = Object.freeze({
    async insert(row) {
      if (!row || !UUID_PATTERN.test(row.user_id ?? "") || row.resource !== RESOURCE) throw new Error("oauth_transaction_invalid");
      await request("/rest/v1/hq_xmemo_oauth_transactions", {
        method: "POST", body: row, prefer: "return=minimal",
      });
    },
    async consume({ state_hash, user_id, now: consumedAt }) {
      assertUserId(user_id);
      if (typeof state_hash !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state_hash)) throw new Error("oauth_state_invalid");
      const result = await request("/rest/v1/rpc/consume_hq_xmemo_oauth_transaction", {
        method: "POST",
        body: { p_state_hash: state_hash, p_user_id: user_id, p_now: consumedAt },
      });
      const row = Array.isArray(result) ? result[0] : null;
      return row ?? null;
    },
  });

  const credentialStore = Object.freeze({
    async saveEncrypted({ userId, clientId, resource, scopes, accessToken, refreshToken, expiresAt }) {
      assertUserId(userId);
      if (resource !== RESOURCE || typeof clientId !== "string" || !clientId ||
          typeof accessToken !== "string" || !accessToken ||
          typeof refreshToken !== "string" || !refreshToken ||
          !Array.isArray(scopes) || scopes.join(" ") !== "memory:read memory:write" ||
          !Number.isFinite(Date.parse(expiresAt))) {
        throw new Error("oauth_credential_input_invalid");
      }
      const [encryptedAccessToken, encryptedRefreshToken] = await Promise.all([
        seal(userId, accessToken),
        seal(userId, refreshToken),
      ]);
      await request("/rest/v1/hq_xmemo_oauth_credentials?on_conflict=user_id,resource", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          user_id: userId,
          resource,
          client_id: clientId,
          scopes,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          encryption_key_version: KEY_VERSION,
          expires_at: expiresAt,
          updated_at: new Date(now()).toISOString(),
        },
      });
    },
    async load(userId) {
      assertUserId(userId);
      const query = new URLSearchParams({
        select: "client_id,resource,scopes,encrypted_access_token,encrypted_refresh_token,encryption_key_version,expires_at",
        user_id: "eq." + userId,
        resource: "eq." + RESOURCE,
        limit: "1",
      });
      const rows = await request("/rest/v1/hq_xmemo_oauth_credentials?" + query.toString());
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      if (row.encryption_key_version !== KEY_VERSION || row.resource !== RESOURCE) {
        throw new Error("oauth_credential_version_invalid");
      }
      const [accessToken, refreshToken] = await Promise.all([
        open(userId, row.encrypted_access_token),
        open(userId, row.encrypted_refresh_token),
      ]);
      return Object.freeze({
        userId,
        clientId: row.client_id,
        resource: row.resource,
        scopes: row.scopes,
        accessToken,
        refreshToken,
        expiresAt: row.expires_at,
      });
    },
  });

  return Object.freeze({
    transactionStore,
    credentialStore,
    cryptoBox: Object.freeze({ seal, open }),
  });
}
