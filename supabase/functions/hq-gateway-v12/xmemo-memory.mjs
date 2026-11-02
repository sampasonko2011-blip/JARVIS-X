const DEFAULT_BASE_URL = "https://xmemo.dev";
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_CONTEXT_CHARS = 8_000;
const MAX_TASK_CHARS = 12_000;
const MAX_STORED_CHARS = 18_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function memoryPathForUser(userId) {
  if (typeof userId !== "string" || !UUID_PATTERN.test(userId.trim())) {
    throw new TypeError("xmemo_user_id_invalid");
  }
  return "projects/jarvis-x-hq/users/" + userId.trim() + "/conversations";
}

export function redactForMemory(value) {
  const text = typeof value === "string" ? value : "";
  return text
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, "[REDACTED_SECRET]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/gi, "[REDACTED_CREDENTIAL]");
}

/**
 * Testable XMemo transport. It never decides consent: callers must gate recall
 * and store separately for each request before invoking these methods.
 */
export function createXMemoMemoryClient({
  apiKey = "",
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("xmemo_fetch_required");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new TypeError("xmemo_timeout_invalid");
  }
  const endpoint = String(baseUrl).replace(/\/+$/, "");

  async function request(path, body) {
    return await fetchImpl(endpoint + path, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(body),
    });
  }

  async function recall(task, userId) {
    if (!apiKey) return { status: "not_configured", context: "" };
    let path;
    try { path = memoryPathForUser(userId); } catch {
      return { status: "invalid_user", context: "" };
    }
    if (typeof task !== "string" || !task.trim()) return { status: "invalid_input", context: "" };
    try {
      const response = await request("/v1/recall/context", {
        query: redactForMemory(task).slice(0, MAX_TASK_CHARS),
        path,
        max_items: 6,
        max_tokens: 1_200,
        prefer_working: true,
      });
      if (!response.ok) {
        await response.text().catch(() => "");
        return { status: "unavailable", context: "" };
      }
      const data = await response.json().catch(() => ({}));
      const context = typeof data?.context_text === "string"
        ? data.context_text.slice(0, MAX_CONTEXT_CHARS)
        : "";
      return { status: context.trim() ? "recalled" : "empty", context };
    } catch {
      return { status: "unavailable", context: "" };
    }
  }

  async function store(task, answer, userId, taskType) {
    if (!apiKey) return "not_configured";
    let path;
    try { path = memoryPathForUser(userId); } catch {
      return "invalid_user";
    }
    if (typeof task !== "string" || typeof answer !== "string") return "invalid_input";
    try {
      const content = ("User request:\n" + redactForMemory(task) + "\n\nJARVIS-X response:\n" + redactForMemory(answer)).slice(0, MAX_STORED_CHARS);
      const response = await request("/v1/remember", {
        content,
        path,
        source: "jarvis-x-hq",
        dedupe: true,
        metadata: { kind: "conversation_turn", task_type: typeof taskType === "string" ? taskType.slice(0, 80) : "unknown", source: "jarvis-x-hq" },
      });
      if (!response.ok) {
        await response.text().catch(() => "");
        return "failed";
      }
      return "stored";
    } catch {
      return "failed";
    }
  }

  return Object.freeze({ recall, store });
}
