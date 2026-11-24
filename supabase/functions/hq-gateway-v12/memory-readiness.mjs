export function resolveMemoryReadiness({
  supabaseUrlConfigured = false,
  serviceRoleConfigured = false,
  encryptionSecretConfigured = false,
  legacyApiKeyConfigured = false,
} = {}) {
  const oauthConfigurationReady = supabaseUrlConfigured && serviceRoleConfigured && encryptionSecretConfigured;
  const legacyFallbackConfigured = legacyApiKeyConfigured;
  return Object.freeze({
    oauthConfigurationReady,
    legacyFallbackConfigured,
    memoryConfigured: oauthConfigurationReady || legacyFallbackConfigured,
    mode: oauthConfigurationReady ? "oauth-configured" : legacyFallbackConfigured ? "legacy-fallback-configured" : "unavailable",
  });
}
