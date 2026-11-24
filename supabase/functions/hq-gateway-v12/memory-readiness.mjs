export function resolveMemoryReadiness({
  supabaseUrlConfigured = false,
  serviceRoleConfigured = false,
  encryptionSecretConfigured = false,
  legacyApiKeyConfigured = false,
} = {}) {
  const oauthConfigurationReady = supabaseUrlConfigured && serviceRoleConfigured && encryptionSecretConfigured;
  const legacyFallbackConfigured = legacyApiKeyConfigured;
  return Object.freeze({
    oauthReady,
    legacyFallbackReady,
    memoryConfigured: oauthReady || legacyFallbackReady,
    mode: oauthReady ? "oauth-ready" : legacyFallbackReady ? "legacy-fallback-only" : "unavailable",
  });
}
