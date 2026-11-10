import { discoverXMemoOAuth } from "./xmemo-oauth-discovery.mjs";
import { registerXMemoOAuthClient, buildXMemoAuthorizationUrl, exchangeXMemoAuthorizationCode } from "./xmemo-oauth-client.mjs";
import { createXMemoOAuthSupabaseAdapters } from "./xmemo-oauth-supabase.mjs";
import { createXMemoOAuthTransactionCoordinator } from "./xmemo-oauth-transaction.mjs";

export const XMEMO_HQ_CALLBACK_URI = "https://sampasonko2011-blip.github.io/JARVIS-X/hq/xmemo-oauth-callback.html";
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

export function createXMemoOAuthRouter() {
  async function start(userId) {
    const metadata = await discover();
    const registration = await register(metadata);
    const { adapters } = createRuntime();
    const coordinator = createXMemoOAuthTransactionCoordinator({
      ...adapters,
      exchangeCode: (input) => exchangeXMemoAuthorizationCode({
        metadata,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        code: input.code,
        verifier: input.verifier,
      }),
    });
    const transaction = await coordinator.begin({
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
    const coordinator = createXMemoOAuthTransactionCoordinator({
      ...adapters,
      exchangeCode: (input) => exchangeXMemoAuthorizationCode({
        metadata,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        code: input.code,
        verifier: input.verifier,
      }),
    });
    return await coordinator.complete({ userId, state, code });
  }

  return Object.freeze({ start, complete });
}
