import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createXMemoMcpClient } from "./xmemo-mcp-transport.mjs";

function response(value, status = 200, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { "Content-Type": status === 204 ? "" : "application/json", ...headers },
  });
}

test("initializes MCP, lists tools, calls a tool and closes its session", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const message = JSON.parse(options.body);
    if (message.method === "initialize") {
      assert.equal(options.headers["MCP-Protocol-Version"], undefined);
      return response({
        jsonrpc: "2.0", id: message.id,
        result: {
          protocolVersion: "2025-03-26",
          serverInfo: { name: "XMemo", version: "1" },
          capabilities: { tools: {} },
        },
      }, 200, { "Mcp-Session-Id": "session-123" });
    }
    if (message.method === "notifications/initialized") return response(null, 202);
    assert.equal(options.headers["MCP-Protocol-Version"], "2025-03-26");
    assert.equal(options.headers["Mcp-Session-Id"], "session-123");
    if (message.method === "tools/list") {
      return response({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "recall" }] } });
    }
    if (message.method === "tools/call") {
      return response({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "ok" }] } });
    }
    throw new Error("unexpected method " + message.method);
  };
  const client = createXMemoMcpClient({ accessToken: "test-token", fetchImpl, cryptoImpl: { randomUUID } });
  const init = await client.initialize();
  assert.equal(init.serverInfo.name, "XMemo");
  const tools = await client.listTools();
  assert.equal(tools[0].name, "recall");
  const result = await client.callTool("recall", { query: "test", limit: 1 });
  assert.equal(result.content[0].text, "ok");
  assert.equal(await client.close(), true);
  assert.equal(calls.length, 4);
});

test("rejects use before initialize, untrusted endpoint, and empty token", () => {
  const fetchImpl = async () => response({});
  assert.throws(() => createXMemoMcpClient({ accessToken: "", fetchImpl, cryptoImpl: { randomUUID } }), /access_token_required/);
  assert.throws(() => createXMemoMcpClient({ accessToken: "token", endpoint: "https://attacker.example/mcp", fetchImpl, cryptoImpl: { randomUUID } }), /endpoint_not_allowed/);
  const client = createXMemoMcpClient({ accessToken: "token", fetchImpl, cryptoImpl: { randomUUID } });
  assert.rejects(client.listTools(), /not_initialized/);
});

test("rejects JSON-RPC response id mismatch", async () => {
  const fetchImpl = async (_url, options) => {
    const message = JSON.parse(options.body);
    if (message.method === "initialize") {
      return response({ jsonrpc: "2.0", id: "wrong", result: { protocolVersion: "2025-03-26", serverInfo: { name: "XMemo" } } });
    }
    return response(null, 202);
  };
  const client = createXMemoMcpClient({ accessToken: "token", fetchImpl, cryptoImpl: { randomUUID } });
  await assert.rejects(client.initialize(), /response_mismatch/);
});
