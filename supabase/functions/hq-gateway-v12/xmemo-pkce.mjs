const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeBase64Url(bytes) {
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] : 0;
    const c = hasC ? bytes[i + 2] : 0;
    output += BASE64URL[a >> 2];
    output += BASE64URL[((a & 3) << 4) | (b >> 4)];
    if (hasB) output += BASE64URL[((b & 15) << 2) | (c >> 6)];
    if (hasC) output += BASE64URL[c & 63];
  }
  return output;
}

function randomUrlSafe(length, cryptoImpl) {
  const bytes = new Uint8Array(length);
  cryptoImpl.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

/** Generate RFC 7636 S256 verifier/challenge and independent anti-CSRF state. */
export async function createPkceAuthorizationMaterial({ cryptoImpl = globalThis.crypto } = {}) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== "function") {
    throw new Error("pkce_webcrypto_unavailable");
  }
  const verifier = randomUrlSafe(32, cryptoImpl);
  const state = randomUrlSafe(32, cryptoImpl);
  const digest = await cryptoImpl.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = encodeBase64Url(new Uint8Array(digest));
  if (verifier.length < 43 || verifier.length > 128 || !/^[A-Za-z0-9._~-]+$/.test(verifier)) {
    throw new Error("pkce_verifier_invalid");
  }
  return Object.freeze({ verifier, challenge, method: "S256", state });
}
