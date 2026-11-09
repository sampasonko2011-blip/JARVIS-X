const MCP_ENDPOINT = "https://xmemo.dev/mcp";
const SUPPORTED_PROTOCOLS = ["2025-03-26", "2024-11-05"];

function assertToken(token) {
  if (typeof token !== "string" || !token.trim() || token.length > 16_384) {
    throw new Error("xmemo_mcp_access_token_required");
  }
}
function parseSse(text) {
  const events = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try { events.push(JSON.parse(data)); } catch { throw new Error("xmemo_mcp_sse_invalid_json"); }
  }
  return events;
}
async function parseResponse(response) {
  if (!response.ok) throw new Error("xmemo_mcp_http_" + response.status);
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (type.includes("application/json")) return await response.json();
  if (type.includes("text/event-stream")) {
    const events = parseSse(await response.text());
    const message = events.find(event => event && (event.jsonrpc === "2.0" || event.result || event.error));
    if (!message) throw new Error("xmemo_mcp_sse_no_message");
    return message;
  }
  if (response.status === 202 || response.status === 204) return null;
  throw new Error("xmemo_mcp_content_type_unsupported");
}

/**
 * Minimal Streamable HTTP MCP client for XMemo's hosted MCP endpoint.
 * The caller must supply a short-lived access token from the server-side
 * encrypted credential store. Never instantiate this in browser code.
 */
export function createXMemoMcpClient({
  accessToken,
  endpoint = MCP_ENDPOINT,
  fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto,
  timeoutMs = 12_000,
} = {}) {
  assertToken(accessToken);
  let target;
  try { target = new URL(endpoint); } catch { throw new Error("xmemo_mcp_endpoint_invalid"); }
  if (target.href !== MCP_ENDPOINT || target.protocol !== "https:") throw new Error("xmemo_mcp_endpoint_not_allowed");
  if (typeof fetchImpl !== "function" || !cryptoImpl?.randomUUID) throw new Error("xmemo_mcp_runtime_missing");
  let requestId = 0;
  let sessionId = null;
  let protocolVersion = null;
  let initialized = false;

  async function post(message, { notification = false } = {}) {
    const headers = {
      Authorization: "Bearer " + accessToken,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    };
    if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetchImpl(MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const returnedSession = response.headers.get("Mcp-Session-Id");
    if (returnedSession) sessionId = returnedSession;
    const value = await parseResponse(response);
    if (notification) return null;
    if (!value || value.jsonrpc !== "2.0" || value.id !== message.id) {
      throw new Error("xmemo_mcp_response_mismatch");
    }
    if (value.error) {
      const error = new Error("xmemo_mcp_rpc_" + (value.error.code ?? "unknown"));
      error.code = value.error.code;
      throw error;
    }
    return value.result;
  }

  async function rpc(method, params = {}) {
    if (!initialized && method !== "initialize") throw new Error("xmemo_mcp_not_initialized");
    const id = ++requestId;
    return await post({ jsonrpc: "2.0", id, method, params });
  }

  return Object.freeze({
    async initialize({ clientName = "JARVIS-X HQ", clientVersion = "1.0.0" } = {}) {
      if (initialized) throw new Error("xmemo_mcp_already_initialized");
      let lastError;
      for (const version of SUPPORTED_PROTOCOLS) {
        protocolVersion = version;
        try {
          const result = await rpc("initialize", {
            protocolVersion: version,
            capabilities: {},
            clientInfo: { name: clientName, version: clientVersion },
          });
          if (!result || result.protocolVersion !== version || !result.serverInfo?.name) {
            throw new Error("xmemo_mcp_initialize_result_invalid");
          }
          await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { notification: true });
          initialized = true;
          return Object.freeze({ protocolVersion: version, serverInfo: result.serverInfo, capabilities: result.capabilities ?? {} });
        } catch (error) {
          lastError = error;
          if (error?.code !== -32602) break;
        }
      }
      protocolVersion = null;
      throw lastError ?? new Error("xmemo_mcp_initialize_failed");
    },
    async listTools() {
      const result = await rpc("tools/list");
      if (!result || !Array.isArray(result.tools)) throw new Error("xmemo_mcp_tools_list_invalid");
      return result.tools;
    },
    async callTool(name, args = {}) {
      if (typeof name !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(name)) throw new Error("xmemo_mcp_tool_name_invalid");
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("xmemo_mcp_tool_arguments_invalid");
      const result = await rpc("tools/call", { name, arguments: args });
      if (!result || typeof result !== "object") throw new Error("xmemo_mcp_tool_result_invalid");
      if (result.isError) throw new Error("xmemo_mcp_tool_execution_failed");
      return result;
    },
    async close() {
      if (!sessionId) return false;
      const headers = { Authorization: "Bearer " + accessToken, "Mcp-Session-Id": sessionId };
      if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
      const response = await fetchImpl(MCP_ENDPOINT, {
        method: "DELETE", headers, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (![200, 202, 204, 404].includes(response.status)) throw new Error("xmemo_mcp_close_http_" + response.status);
      sessionId = null;
      initialized = false;
      protocolVersion = null;
      return true;
    },
  });
}
