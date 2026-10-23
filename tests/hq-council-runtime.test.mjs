import test from "node:test";
import assert from "node:assert/strict";
import { runCouncil } from "../hq/council-runtime.mjs";

function provider(id, response, extra = {}) {
  return {
    id,
    modelId: `model-${id}`,
    status: "WORLD_STATE_VERIFIED",
    authorized: true,
    liveTestPassed: true,
    async invoke(payload, { signal }) {
      assert.equal(signal instanceof AbortSignal, true);
      assert.ok(payload.instructions);
      return { text: response, requestId: `request-${id}`, latencyMs: 12 };
    },
    ...extra,
  };
}

test("council uses distinct lead, independent critic, and synthesizer adapters", async () => {
  const calls = [];
  const providers = [
    provider("lead", "Lead answer", { async invoke(payload) { calls.push(["lead", payload.role]); return { text: "Lead answer", requestId: "r1" }; } }),
    provider("critic", "Counterevidence", { async invoke(payload) { calls.push(["critic", payload.role, payload.leadAnswer]); return { text: "Counterevidence", requestId: "r2" }; } }),
    provider("synth", "Balanced synthesis", { async invoke(payload) { calls.push(["synth", payload.role, payload.critique]); return { text: "Balanced synthesis", requestId: "r3" }; } }),
  ];
  const result = await runCouncil({
    objective: "Compare approaches",
    providers,
    now: () => "2026-10-23T12:00:00.000Z",
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.providerCalls, 3);
  assert.equal(result.answer, "Balanced synthesis");
  assert.deepEqual(calls.map((x) => x[0]), ["lead", "critic", "synth"]);
  assert.equal(calls[1][2], "Lead answer");
  assert.equal(calls[2][2], "Counterevidence");
  assert.equal(result.timestamp, "2026-10-23T12:00:00.000Z");
  assert.match(result.evidenceBoundary, /does not independently verify/);
});

test("council refuses unverified, unauthorized, duplicate, or insufficient providers before any call", async () => {
  let calls = 0;
  const callProvider = (id, extra = {}) => provider(id, "reply", { async invoke() { calls++; return { text: "reply" }; }, ...extra });
  const result = await runCouncil({
    objective: "Research",
    providers: [
      callProvider("a"),
      callProvider("a"),
      callProvider("b", { authorized: false }),
      callProvider("c", { liveTestPassed: false }),
    ],
  });
  assert.equal(result.status, "MANUAL_HANDOFF");
  assert.equal(result.providerCalls, 0);
  assert.equal(calls, 0);

  const sameModel = [
    callProvider("model-a", { modelId: "shared-model" }),
    callProvider("model-b", { modelId: "shared-model" }),
    callProvider("model-c", { modelId: "unique-model" }),
  ];
  const independence = await runCouncil({ objective: "Check independence", providers: sameModel });
  assert.equal(independence.status, "MANUAL_HANDOFF");
  assert.equal(independence.providerCalls, 0);
});

test("council blocks invalid objectives and timeout values before invoking adapters", async () => {
  let calls = 0;
  const providers = ["a", "b", "c"].map((id) => provider(id, "ok", {
    async invoke() { calls++; return { text: "ok" }; },
  }));
  assert.equal((await runCouncil({ objective: " " , providers })).reason, "OBJECTIVE_REQUIRED");
  assert.equal((await runCouncil({ objective: "valid", providers, timeoutMs: 1 })).reason, "INVALID_TIMEOUT");
  assert.equal(calls, 0);
});

test("council does not claim completion if lead stage fails", async () => {
  const providers = [
    provider("lead", "", { async invoke() { throw new Error("redacted secret-bearing provider error"); } }),
    provider("critic", "critique"),
    provider("synth", "synthesis"),
  ];
  const result = await runCouncil({ objective: "Test failure", providers });
  assert.equal(result.status, "FAILED");
  assert.equal(result.reason, "LEAD_STAGE_FAILED");
  assert.equal(result.providerCalls, 1);
  assert.equal(result.stages[0].error.message, "Provider invocation failed; raw error details were intentionally redacted.");
  assert.equal(JSON.stringify(result).includes("secret-bearing"), false);
});

test("council returns partial result instead of pretending critic failure is consensus", async () => {
  const providers = [
    provider("lead", "lead answer"),
    provider("critic", "", { async invoke() { throw new Error("critic down"); } }),
    provider("synth", "must not be called", { async invoke() { assert.fail("synthesis should not run after critic failure"); } }),
  ];
  const result = await runCouncil({ objective: "Test critic failure", providers });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.reason, "INDEPENDENT_CRITIC_FAILED");
  assert.equal(result.leadAnswer, "lead answer");
  assert.equal(result.providerCalls, 2);
});

test("council refuses empty provider replies and does not leak arbitrary error text", async () => {
  const providers = [
    provider("lead", " "),
    provider("critic", "critique"),
    provider("synth", "synthesis"),
  ];
  const result = await runCouncil({ objective: "Test empty", providers });
  assert.equal(result.status, "FAILED");
  assert.equal(result.stages[0].reason, "EMPTY_OR_INVALID_REPLY");
});


test("council timeout aborts the adapter signal and returns a bounded failure", async () => {
  let signalAborted = false;
  const providers = [
    provider("slow-lead", "unused", {
      async invoke(_payload, { signal }) {
        await new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            signalAborted = true;
            resolve();
          }, { once: true });
        });
        throw Object.assign(new Error("late failure"), { name: "AbortError" });
      },
    }),
    provider("critic", "critique"),
    provider("synth", "synthesis"),
  ];
  const result = await runCouncil({ objective: "Test timeout", providers, timeoutMs: 100 });
  assert.equal(result.status, "FAILED");
  assert.equal(result.stages[0].reason, "TIMEOUT");
  assert.equal(signalAborted, true);
});


test("council rejects malformed provider collections and oversized replies", async () => {
  assert.equal(
    (await runCouncil({ objective: "Malformed", providers: {} })).reason,
    "PROVIDERS_MUST_BE_AN_ARRAY"
  );
  const providers = [
    provider("lead", "x".repeat(60001)),
    provider("critic", "critique"),
    provider("synth", "synthesis"),
  ];
  const result = await runCouncil({ objective: "Bound outputs", providers });
  assert.equal(result.status, "FAILED");
  assert.equal(result.stages[0].reason, "REPLY_TOO_LONG");
});
