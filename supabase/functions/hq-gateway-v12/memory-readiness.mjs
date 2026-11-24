export function resolveMemoryReadiness({
  supabaseUrlConfigured = false,
  serviceRoleConfigured = false,
  encryptionSecretConfigured = false,
  legacyApiKeyConfigured = false,
} = {}) {
  const oauthReady = supabaseUrlConfigured && serviceRoleConfigured && encryptionSecretConfigured;
  const legacyFallbackReady = legacyApiKeyConfigured;
  return Object.freeze({
    oauthReady,
    legacyFallbackReady,
    memoryConfigured: oauthReady || legacyFallbackReady,
    mode: oauthReady ? "oauth-ready" : legacyFallbackReady ? "legacy-fallback-only" : "unavailable",
  });
}
