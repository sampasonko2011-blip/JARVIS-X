export function resolveMemoryReadiness({
  supabaseUrlConfigured = false,
  serviceRoleConfigured = false,
  encryptionSecretConfigured = false,
  legacyApiKeyConfigured = false,
} = {}) {
  const memoryOAuthConfigured = supabaseUrlConfigured && serviceRoleConfigured && encryptionSecretConfigured;
  const memoryLegacyFallbackConfigured = legacyApiKeyConfigured;
  return Object.freeze({
    memoryOAuthConfigured,
    memoryLegacyFallbackConfigured,
    memoryConfigured: memoryOAuthConfigured || memoryLegacyFallbackConfigured,
    memoryConfigurationMode: memoryOAuthConfigured
      ? "oauth-configured"
      : memoryLegacyFallbackConfigured ? "legacy-fallback-configured" : "unavailable",
  });
}
