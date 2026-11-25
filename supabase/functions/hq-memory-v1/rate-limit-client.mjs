const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {{ supabaseUrl?: string, serviceRoleKey?: string, fetchImpl?: typeof fetch }} options
 */
export function createRateLimitConsumer({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  return async function consumeRateLimit(userId, key) {
    if (typeof supabaseUrl !== "string" || !supabaseUrl.trim() ||
        typeof serviceRoleKey !== "string" || !serviceRoleKey.trim() ||
        typeof fetchImpl !== "function") {
      throw new Error("rate_limit_service_credentials_missing");
    }
    if (typeof userId !== "string" || !UUID_PATTERN.test(userId) ||
        !["minute", "day"].includes(key)) {
      throw new Error("rate_limit_input_invalid");
    }

    const response = await fetchImpl(
      supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/consume_hq_rate_limit",
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: "Bearer " + serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_user_id: userId, p_limit_key: key }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) throw new Error("rate_limit_check_failed");

    const data = await response.json().catch(() => null);
    const row = Array.isArray(data) ? data[0] : null;
    const expectedLimit = key === "minute" ? 10 : 100;
    const resetAt = typeof row?.reset_at === "string" ? Date.parse(row.reset_at) : Number.NaN;
    if (!row || typeof row.allowed !== "boolean" || row.limit_key !== key ||
        row.request_limit !== expectedLimit || !Number.isInteger(row.remaining) ||
        row.remaining < 0 || row.remaining >= expectedLimit ||
        !Number.isFinite(resetAt) || resetAt <= Date.now()) {
      throw new Error("rate_limit_response_invalid");
    }
    return row;
  };
}
