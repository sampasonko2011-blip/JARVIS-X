import { createXMemoMemoryClient } from "../hq-gateway-v12/xmemo-memory.mjs";
import { createMemoryGateway } from "./memory-gateway.mjs";
import { createRateLimitConsumer } from "./rate-limit-client.mjs";

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

const consumeRateLimit = createRateLimitConsumer({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
});

const memoryClient = createXMemoMemoryClient({ apiKey: Deno.env.get("XMEMO_API_KEY") ?? "" });
const handle = createMemoryGateway({
  allowedEmails: Deno.env.get("JX_MEMORY_ALLOWED_EMAILS") ?? "",
  allowedOrigins,
  authenticate,
  consumeRateLimit,
  memoryClient,
});

Deno.serve(handle);
