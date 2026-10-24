import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { createGatewayHandler } from "./gateway-handler.mjs";
import { createSupabaseAuthenticator } from "./supabase-auth.mjs";
import { createFileAttestationLoader } from "./file-attestation-store.mjs";
import { createCompositeServerRuntime } from "../hq/composite-server.mjs";

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`REQUIRED_ENVIRONMENT_VARIABLE_MISSING:${name}`);
  }
  return value.trim();
}

async function readPrivateJsonFile(path, label, maxBytes = 5 * 1024 * 1024) {
  if (!isAbsolute(path)) throw new Error(`${label}_PATH_MUST_BE_ABSOLUTE`);
  const info = await stat(path);
  if (!info.isFile() || info.size > maxBytes) throw new Error(`${label}_FILE_INVALID`);
  if (process.platform !== "win32" && (info.mode & 0o022) !== 0) {
    throw new Error(`${label}_FILE_PERMISSIONS_TOO_OPEN`);
  }
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

const allowedOrigin = required("JX_ALLOWED_ORIGIN");
const registryPath = required("JX_MODEL_REGISTRY_PATH");
const attestationsPath = required("JX_ATTESTATIONS_PATH");
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT_INVALID");

// Fail closed at startup if the secret or deployment configuration is missing.
required("JX_ATTESTATION_HMAC_KEY");
const registry = await readPrivateJsonFile(registryPath, "MODEL_REGISTRY");
if (!Array.isArray(registry?.candidates)) throw new Error("MODEL_REGISTRY_FORMAT_INVALID");
const loadAttestations = createFileAttestationLoader({ path: attestationsPath });
const runtime = createCompositeServerRuntime({ registry, loadAttestations });
const authenticateRequest = createSupabaseAuthenticator();

const server = createServer(createGatewayHandler({
  runtime,
  authenticateRequest,
  allowedOrigin,
  service: "jarvis-x-gateway",
  version: process.env.JX_BUILD_VERSION || "0.1.0",
  maxBodyBytes: 16 * 1024,
  maxMessageChars: 12_000,
  maxRequestsPerMinute: 20,
}));

server.requestTimeout = 60_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.listen(port, "0.0.0.0", () => {
  // Never log secrets, tokens, evidence records, or provider prompts.
  process.stdout.write(`JARVIS-X gateway listening on port ${port}; origin allowlist configured.\n`);
});

function shutdown(signal) {
  process.stdout.write(`Received ${signal}; closing gateway.\n`);
  server.close(error => {
    if (error) process.exitCode = 1;
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
