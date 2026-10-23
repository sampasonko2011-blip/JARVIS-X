import test from "node:test";
import assert from "node:assert/strict";
import { executeAuthorizedTool } from "../hq/tool-broker-runtime.mjs";

const tool = { id: "records", enabled: true, allowedScopes: ["record:123:read", "record:123:update"] };
const approval = {
  approved: true,
  approvedBy: "owner",
  approvalId: "approval-123",
  requestId: "request-123",
  toolId: "records",
  action: "update",
  scope: ["record:123:update"],
};
function request(overrides = {}) {
  return {
    requestId: "request-123",
    idempotencyKey: "idem-123",
    toolId: "records",
    action: "update",
    scope: ["record:123:update"],
    approval,
    payload: { value: "new-value" },
    ...overrides,
  };
}
const validOutput = async (output) => output?.ok === true;
const validWorldState = async ({ output }) => output?.worldState === "updated";
const auditOk = async () => {};

test("tool broker executes only after scope, approval, audit, output, and world-state gates", async () => {
  let calls = 0;
  const events = [];
  const result = await executeAuthorizedTool({
    request: request(),
    tool,
    async executor(payload, context) {
      calls++;
      assert.equal(payload.value, "new-value");
      assert.equal(context.idempotencyKey, "idem-123");
      assert.deepEqual(context.scope, ["record:123:update"]);
      return { ok: true, worldState: "updated" };
    },
    validateOutput: validOutput,
    verifyWorldState: validWorldState,
    async audit(event) { events.push(event.event); },
  });
  assert.equal(result.status, "EXECUTED");
  assert.equal(result.outputValidated, true);
  assert.equal(result.worldStateVerified, true);
  assert.equal(calls, 1);
  assert.deepEqual(events, ["TOOL_EXECUTION_AUTHORIZED", "EXECUTED"]);
});

test("tool broker blocks ungranted scope, missing approval, or unavailable verifiers before execution", async () => {
  let calls = 0;
  const base = {
    tool,
    async executor() { calls++; return { ok: true, worldState: "updated" }; },
    validateOutput: validOutput,
    verifyWorldState: validWorldState,
    audit: auditOk,
  };
  const scope = await executeAuthorizedTool({ ...base, request: request({ scope: ["record:999:delete"] }) });
  assert.equal(scope.reason, "SCOPE_NOT_GRANTED");
  const noApproval = await executeAuthorizedTool({ ...base, request: request({ approval: undefined }) });
  assert.equal(noApproval.reason, "EXPLICIT_APPROVAL_REQUIRED");
  const noVerifier = await executeAuthorizedTool({ ...base, request: request(), verifyWorldState: undefined });
  assert.equal(noVerifier.reason, "EXECUTOR_VERIFIERS_AND_AUDIT_REQUIRED");
  assert.equal(calls, 0);
});

test("tool broker rejects approvals bound to a different action or request", async () => {
  let calls = 0;
  const base = {
    request: request(),
    tool,
    async executor() { calls++; return { ok: true, worldState: "updated" }; },
    validateOutput: validOutput,
    verifyWorldState: validWorldState,
    audit: auditOk,
  };
  const wrongRequest = await executeAuthorizedTool({
    ...base,
    request: request({ approval: { ...approval, requestId: "another-request" } }),
  });
  assert.equal(wrongRequest.reason, "EXPLICIT_APPROVAL_REQUIRED");
  const wrongAction = await executeAuthorizedTool({
    ...base,
    request: request({ approval: { ...approval, action: "delete" } }),
  });
  assert.equal(wrongAction.reason, "EXPLICIT_APPROVAL_REQUIRED");
  const wrongScope = await executeAuthorizedTool({
    ...base,
    request: request({ approval: { ...approval, scope: ["record:999:update"] } }),
  });
  assert.equal(wrongScope.reason, "EXPLICIT_APPROVAL_REQUIRED");
  assert.equal(calls, 0);
});

test("tool broker never claims success when output or world state cannot be verified", async () => {
  const base = {
    request: request(),
    tool,
    async executor() { return { ok: true, worldState: "updated" }; },
    validateOutput: validOutput,
    verifyWorldState: validWorldState,
    audit: auditOk,
  };
  const badOutput = await executeAuthorizedTool({ ...base, validateOutput: async () => false });
  assert.equal(badOutput.status, "OUTPUT_VALIDATION_FAILED");
  const badState = await executeAuthorizedTool({ ...base, verifyWorldState: async () => false });
  assert.equal(badState.status, "WORLD_STATE_UNVERIFIED");
});

test("tool broker treats timeouts as unknown outcomes and explicitly forbids automatic retry", async () => {
  let calls = 0;
  const result = await executeAuthorizedTool({
    request: request(),
    tool,
    async executor(_payload, { signal }) {
      calls++;
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      throw Object.assign(new Error("private connector details"), { name: "AbortError" });
    },
    validateOutput: validOutput,
    verifyWorldState: validWorldState,
    audit: auditOk,
    timeoutMs: 100,
  });
  assert.equal(result.status, "OUTCOME_UNKNOWN");
  assert.match(result.reason, /NO_RETRY/);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes("private connector details"), false);
});

test("tool broker blocks before execution if the pre-execution audit fails", async () => {
  let calls = 0;
  const result = await executeAuthorizedTool({
    request: request(),
    tool,
    async executor() { calls++; return { ok: true, worldState: "updated" }; },
    validateOutput: validOutput,
    verifyWorldState: validWorldState,
    async audit() { throw new Error("audit unavailable"); },
  });
  assert.equal(result.reason, "PRE_EXECUTION_AUDIT_FAILED");
  assert.equal(calls, 0);
});
