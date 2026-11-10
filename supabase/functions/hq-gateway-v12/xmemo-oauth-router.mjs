import { discoverXMemoOAuth } from "./xmemo-oauth-discovery.mjs";
import {
  registerXMemoOAuthClient,
  buildXMemoAuthorizationUrl,
  exchangeXMemoAuthorizationCode,
  refreshXMemoAccessToken,
} from "./xmemo-oauth-client.mjs";
import { createXMemoOAuthSupabaseAdapters } from "./xmemo-oauth-supabase.mjs";
import { createXMemoOAuthTransactionCoordinator } from "./xmemo-oauth-transaction.mjs";
import { createXMemoMcpClient } from "./xmemo-mcp-transport.mjs";
import { redactForMemory } from "./xmemo-memory.mjs";

export const XMEMO_HQ_CALLBACK_URI = "https://sampasonko2011-blip.github.io/JARVIS-X/hq/xmemo-oauth-callback.html";
const XMEMO_RESOURCE = "https://xmemo.dev/mcp";
const MEMORY_PATH = "work/jarvis-x-hq";
let metadataPromise = null;
let registrationPromise = null;

function requiredEnv(name) {
  const value = Deno.env.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error("oauth_environment_missing_" + name.toLowerCase());
  return value.trim();
}

function createRuntime() {
  const adapters = createXMemoOAuthSupabaseAdapters({
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    encryptionKey: requiredEnv("JX_ENCRYPTION_SECRET"),
  });
  return { adapters };
}

async function discover() {
  if (!metadataPromise) {
    metadataPromise = discoverXMemoOAuth().catch((error) => {
      metadataPromise = null;
      throw error;
    });
  }
  return await metadataPromise;
}

async function register(metadata) {
  if (!registrationPromise) {
    registrationPromise = registerXMemoOAuthClient({
      metadata,
      redirectUri: XMEMO_HQ_CALLBACK_URI,
      clientName: "JARVIS-X HQ",
    }).catch((error) => {
      registrationPromise = null;
      throw error;
    });
  }
  return await registrationPromise;
}

function createCoordinator(metadata, adapters) {
  return createXMemoOAuthTransactionCoordinator({
    ...adapters,
    exchangeCode: (input) => exchangeXMemoAuthorizationCode({
      metadata,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      code: input.code,
      verifier: input.verifier,
    }),
  });
}

async function withMcpClient(userId, work) {
  const metadata = await discover();
  const { adapters } = createRuntime();
  const credentials = await adapters.credentialStore.load(userId);
  if (!credentials) return { status: "not_connected" };

  let accessToken = credentials.accessToken;
  const expiresAt = Date.parse(credentials.expiresAt);
  if (!Number.isFinite(expiresAt)) throw new Error("oauth_credential_expiry_invalid");
  if (expiresAt <= Date.now() + 60_000) {
    const refreshed = await refreshXMemoAccessToken({
      metadata,
      clientId: credentials.clientId,
      refreshToken: credentials.refreshToken,
    });
    accessToken = refreshed.accessToken;
    await adapters.credentialStore.saveEncrypted({
      userId,
      clientId: credentials.clientId,
      resource: XMEMO_RESOURCE,
      scopes: credentials.scopes,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    });
  }

  const client = createXMemoMcpClient({ accessToken });
  try {
    await client.initialize({ clientName: "JARVIS-X HQ", clientVersion: "1.0.0" });
    const tools = await client.listTools();
    const byName = new Map(tools.filter((tool) => tool && typeof tool.name === "string").map((tool) => [tool.name, tool]));
    return await work(client, byName);
  } finally {
    await client.close().catch(() => false);
  }
}

export function createXMemoOAuthRouter() {
  async function start(userId) {
    const metadata = await discover();
    const registration = await register(metadata);
    const { adapters } = createRuntime();
    const transaction = await createCoordinator(metadata, adapters).begin({
      userId,
      clientId: registration.clientId,
      redirectUri: XMEMO_HQ_CALLBACK_URI,
    });
    const authorizationUrl = buildXMemoAuthorizationUrl({
      metadata,
      clientId: registration.clientId,
      redirectUri: XMEMO_HQ_CALLBACK_URI,
      pkce: {
        state: transaction.state,
        challenge: transaction.codeChallenge,
        method: transaction.codeChallengeMethod,
      },
    });
    return Object.freeze({
      authorizationUrl,
      expiresIn: transaction.expiresIn,
      scopes: transaction.scopes,
      resource: transaction.resource,
    });
  }

  async function complete(userId, body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("oauth_callback_body_invalid");
    const { code, state } = body;
    if (typeof code !== "string" || typeof state !== "string") throw new Error("oauth_callback_parameters_missing");
    const metadata = await discover();
    const { adapters } = createRuntime();
    return await createCoordinator(metadata, adapters).complete({ userId, state, code });
  }

  async function recall(userId, query) {
    if (typeof query !== "string" || !query.trim() || query.length > 12_000) throw new Error("xmemo_recall_input_invalid");
    return await withMcpClient(userId, async (client, tools) => {
      if (!tools.has("recall_context")) throw new Error("xmemo_recall_tool_unavailable");
      const result = await client.callTool("recall_context", {
        query: redactForMemory(query).slice(0, 12_000),
        max_items: 6,
        max_tokens: 1_200,
      });
      const text = Array.isArray(result.content)
        ? result.content.filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n")
        : "";
      return { status: text.trim() ? "recalled" : "empty", context: text.slice(0, 8_000) };
    });
  }

  async function remember(userId, content) {
    if (typeof content !== "string" || !content.trim() || content.length > 18_000) throw new Error("xmemo_remember_input_invalid");
    return await withMcpClient(userId, async (client, tools) => {
      if (!tools.has("remember")) throw new Error("xmemo_remember_tool_unavailable");
      const result = await client.callTool("remember", {
        content: redactForMemory(content).slice(0, 18_000),
        path: MEMORY_PATH,
      });
      const text = Array.isArray(result.content)
        ? result.content.filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n")
        : "";
      return { status: "stored", receipt: text.slice(0, 1_000) };
    });
  }

  return Object.freeze({ start, complete, recall, remember });
}
