import { createXMemoMemoryClient } from "../hq-gateway-v12/xmemo-memory.mjs";
import { createMemoryGateway } from "./memory-gateway.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const PUBLISHABLE_KEY = (() => {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys.default === "string" && keys.default) return keys.default;
  } catch { /* use legacy key below */ }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? "";
})();
const allowedOrigins = [
  "https://sampasonko2011-blip.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

async function authenticate(token: string) {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) throw new Error("auth_config_missing");
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  return await response.json();
}

async function consumeRateLimit(key: "minute" | "day", token: string) {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY || !token) throw new Error("rate_limit_config_missing");
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/consume_hq_rate_limit", {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_limit_key: key }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("rate_limit_unavailable");
  const data = await response.json().catch(() => null);
  const row = Array.isArray(data) ? data[0] : null;
  const expectedLimit = key === "minute" ? 10 : 100;
  const resetAt = typeof row?.reset_at === "string" ? Date.parse(row.reset_at) : Number.NaN;
  if (!row || typeof row.allowed !== "boolean" || row.limit_key !== key ||
      row.request_limit !== expectedLimit || !Number.isInteger(row.remaining) ||
      row.remaining < 0 || row.remaining >= expectedLimit || !Number.isFinite(resetAt) || resetAt <= Date.now()) {
    throw new Error("rate_limit_response_invalid");
  }
  return row;
}

const memoryClient = createXMemoMemoryClient({ apiKey: Deno.env.get("XMEMO_API_KEY") ?? "" });
const handle = createMemoryGateway({
  allowedEmails: Deno.env.get("JX_MEMORY_ALLOWED_EMAILS") ?? "",
  allowedOrigins,
  authenticate,
  consumeRateLimit: (_userId: string, key: "minute" | "day", token: string) => consumeRateLimit(key, token),
  memoryClient,
});

Deno.serve(handle);
