/**
 * Supabase Auth session verifier for the JARVIS-X server gateway.
 *
 * This validates access tokens against Supabase Auth's /auth/v1/user endpoint.
 * The publishable/anon key and Supabase URL are server configuration; never
 * trust a user ID supplied by the browser. No service-role key is needed.
 */
export function createSupabaseAuthenticator({
  supabaseUrl = process.env.SUPABASE_URL,
  anonKey = process.env.SUPABASE_ANON_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
} = {}) {
  if (typeof supabaseUrl !== "string" || !supabaseUrl.trim() ||
      typeof anonKey !== "string" || !anonKey.trim() ||
      typeof fetchImpl !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new TypeError("SUPABASE_AUTH_CONFIGURATION_INVALID");
  }
  let base;
  try {
    base = new URL(supabaseUrl);
    if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) {
      throw new TypeError("HTTPS_REQUIRED");
    }
  } catch {
    throw new TypeError("SUPABASE_URL_INVALID");
  }
  const endpoint = new URL("/auth/v1/user", base).toString();

  return async function authenticateRequest(req) {
    const header = req?.headers?.authorization;
    if (typeof header !== "string" || !/^Bearer\s+\S+$/i.test(header)) return null;
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token || token.length > 8192) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const user = await response.json();
      if (typeof user?.id !== "string" || !user.id.trim() ||
          user.is_anonymous === true) return null;
      return { id: user.id, role: "authenticated" };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}
