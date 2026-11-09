const DEFAULT_SUPABASE_URL = "https://xfewajxkqntflfntisut.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_QBs3Y2uByK2kSWXCPg54CQ_oEYapzLg";

export function createLocalMemoryBridge({
  storage = globalThis.sessionStorage,
  fetchImpl = globalThis.fetch,
  supabaseUrl = DEFAULT_SUPABASE_URL,
  publishableKey = DEFAULT_PUBLISHABLE_KEY,
} = {}) {
  if (!storage || typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function" || typeof fetchImpl !== "function") {
    throw new TypeError("memory_bridge_dependencies_required");
  }

  async function accessToken() {
    let session;
    try { session = JSON.parse(storage.getItem("jx-auth-session") || "null"); }
    catch { session = null; }
    if (!session || typeof session.access_token !== "string" ||
        typeof session.refresh_token !== "string" || !session.refresh_token) {
      throw new Error("Sign in from HQ Chat in this same browser tab first.");
    }
    const now = Math.floor(Date.now() / 1000);
    if (Number(session.expires_at) > now + 60) return session.access_token;

    const response = await fetchImpl(supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!response.ok) {
      storage.removeItem?.("jx-auth-session");
      throw new Error("Your HQ sign-in expired. Return to HQ Chat and sign in again.");
    }
    const refreshed = await response.json();
    if (typeof refreshed.access_token !== "string" ||
        typeof refreshed.refresh_token !== "string") {
      storage.removeItem?.("jx-auth-session");
      throw new Error("HQ sign-in refresh returned an invalid session.");
    }
    const updated = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: Number(refreshed.expires_at) ||
        now + Number(refreshed.expires_in || 3600),
    };
    storage.setItem("jx-auth-session", JSON.stringify(updated));
    return updated.access_token;
  }

  async function request(route, payload) {
    const token = await accessToken();
    const response = await fetchImpl(supabaseUrl + "/functions/v1/hq-memory-v1/" + route, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...payload, memory_consent: true }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof result.error === "string" ? result.error : "memory_request_failed";
      throw new Error(code);
    }
    return result;
  }

  return Object.freeze({
    recall(query) {
      if (typeof query !== "string" || !query.trim() || query.length > 4000) {
        throw new TypeError("memory_query_invalid");
      }
      return request("recall", { query: query.trim() });
    },
    remember(task, answer) {
      if (typeof task !== "string" || !task.trim() || task.length > 4000 ||
          typeof answer !== "string" || !answer.trim() || answer.length > 8000) {
        throw new TypeError("memory_record_invalid");
      }
      return request("remember", {
        task: task.trim(),
        answer: answer.trim(),
        task_type: "local_chat",
      });
    },
  });
}
