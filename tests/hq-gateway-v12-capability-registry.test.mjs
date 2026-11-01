import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilityRegistry } from "../supabase/functions/hq-gateway-v12/capability-registry.mjs";

const inputSchema = {
  type: "object",
  properties: { query: { type: "string", maxLength: 100 } },
  required: ["query"],
  additionalProperties: false
};
const baseDefinition = (overrides = {}) => ({
  name: "notes.search",
  description: "Search approved notes",
  inputSchema,
  permission: "notes.read",
  consequence: "read",
  handler: async ({ input }) => ({ matches: [input.query] }),
  ...overrides
});
const context = { userId: "user-fixture", requestId: "request-fixture" };

test("registry is empty by default, explicit, and sealed before execution", async () => {
  const registry = createCapabilityRegistry();
  assert.deepEqual(registry.describe(), []);
  const unsealed = await registry.execute({ name: "notes.search", input: { query: "hello" }, context });
  assert.equal(unsealed.code, "capability_registry_not_sealed");
  registry.register(baseDefinition());
  assert.equal(registry.seal().capabilityCount, 1);
  await assert.rejects(Promise.resolve().then(() => registry.register(baseDefinition({ name: "notes.other" }))), /capability_registry_sealed/);
});

test("only registered, schema-valid, authorized capabilities execute", async () => {
  let calls = 0;
  const registry = createCapabilityRegistry({ permissionCheck: async p => p.permission === "notes.read" });
  registry.register(baseDefinition({ handler: async ({ input }) => { calls++; return { found: input.query }; } }));
  registry.seal();
  const denied = await registry.execute({ name: "notes.unknown", input: { query: "x" }, context });
  const invalid = await registry.execute({ name: "notes.search", input: { query: "x", extra: true }, context });
  const success = await registry.execute({ name: "notes.search", input: { query: "hello" }, context });
  assert.equal(denied.code, "capability_not_registered");
  assert.equal(invalid.status, "rejected");
  assert.equal(success.status, "succeeded");
  assert.deepEqual(success.result, { found: "hello" });
  assert.equal(calls, 1);
});

test("permission failures fail closed", async () => {
  let calls = 0;
  const registry = createCapabilityRegistry({ permissionCheck: async () => { throw new Error("offline"); } });
  registry.register(baseDefinition({ handler: async () => { calls++; return true; } }));
  registry.seal();
  const result = await registry.execute({ name: "notes.search", input: { query: "x" }, context });
  assert.equal(result.code, "capability_permission_check_failed");
  assert.equal(calls, 0);
});

test("consequential capabilities require a valid explicit approval token", async () => {
  let calls = 0;
  const registry = createCapabilityRegistry({
    permissionCheck: async () => true,
    approvalCheck: async ({ approvalToken }) => approvalToken === "approved-fixture"
  });
  registry.register(baseDefinition({ consequence: "consequential", permission: "account.change", handler: async () => { calls++; return { changed: true }; } }));
  registry.seal();
  const missing = await registry.execute({ name: "notes.search", input: { query: "x" }, context });
  const invalid = await registry.execute({ name: "notes.search", input: { query: "x" }, context, approvalToken: "wrong" });
  const approved = await registry.execute({ name: "notes.search", input: { query: "x" }, context, approvalToken: "approved-fixture" });
  assert.equal(missing.status, "approval_required");
  assert.equal(invalid.code, "capability_approval_invalid");
  assert.equal(approved.status, "succeeded");
  assert.equal(calls, 1);
});

test("execution requires user and request context and produces bounded receipts", async () => {
  const registry = createCapabilityRegistry({ permissionCheck: async () => true });
  registry.register(baseDefinition());
  registry.seal();
  const missing = await registry.execute({ name: "notes.search", input: { query: "x" } });
  assert.equal(missing.code, "capability_execution_context_missing");
  const result = await registry.execute({ name: "notes.search", input: { query: "x" }, context });
  assert.equal(result.receiptVersion, 1);
  assert.equal(result.status, "succeeded");
  assert.equal(result.capability, "notes.search");
  assert.equal(typeof result.durationMs, "number");
});

test("handler errors and timeouts are contained", async () => {
  const registry = createCapabilityRegistry({ permissionCheck: async () => true });
  registry.register(baseDefinition({ name: "notes.fail", handler: async () => { throw new Error("secret detail"); } }));
  registry.register(baseDefinition({ name: "notes.slow", timeoutMs: 100, handler: async () => new Promise(() => {}) }));
  registry.seal();
  const failed = await registry.execute({ name: "notes.fail", input: { query: "x" }, context });
  const timeout = await registry.execute({ name: "notes.slow", input: { query: "x" }, context });
  assert.equal(failed.code, "capability_execution_failed");
  assert.equal(timeout.code, "capability_timeout");
  assert.equal(Object.hasOwn(failed, "stack"), false);
});

test("schemas and data trees reject prototype keys, unsupported values, and unbounded structures", () => {
  const registry = createCapabilityRegistry({ permissionCheck: async () => true });
  assert.throws(() => registry.register(baseDefinition({ inputSchema: { type: "object", properties: { constructor: { type: "string" } }, required: [], additionalProperties: false } })), /capability_schema_key_invalid/);
  assert.throws(() => registry.register(baseDefinition({ inputSchema: { type: "object", properties: {}, required: [] } })), /capability_schema_must_be_closed/);
  registry.register(baseDefinition());
  registry.seal();
  const circular = {};
  circular.self = circular;
  return registry.execute({ name: "notes.search", input: circular, context }).then(result => {
    assert.equal(result.code, "capability_object_key_invalid");
  });
});
