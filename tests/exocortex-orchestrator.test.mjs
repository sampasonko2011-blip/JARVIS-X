import test from "node:test";
import assert from "node:assert/strict";
import { ExocortexOrchestrator } from "../dist/core/exocortex-orchestrator.js";

function uiFixture() {
  const calls = [];
  return {
    calls,
    setAmbience: mode => calls.push(["ambience", mode]),
    openIsolatedView: view => calls.push(["view", view]),
    logStep: message => calls.push(["log", message])
  };
}
const plan = { mission: "Réviser puis préparer l'entraînement", steps: [
  { id: "one", label: "Lire le cours", view: "PERCEPTION" },
  { id: "two", label: "Préparer le rappel oral", view: "VOICE" },
  { id: "three", label: "Enregistrer la synthèse", view: "MEMORY" }
] };

test("Lock In requires a separate critic approval before opening isolated views", async () => {
  const ui = uiFixture();
  let critiqueCalled = false;
  const orchestrator = new ExocortexOrchestrator({
    plan: async () => structuredClone(plan),
    critique: async () => { critiqueCalled = true; return { approved: true, findings: [] }; }
  });
  const result = await orchestrator.startLockIn(plan.mission, ui);
  assert.equal(critiqueCalled, true);
  assert.equal(result.status, "LOCK_IN_READY");
  assert.deepEqual(ui.calls.filter(x => x[0] === "view"), [
    ["view", "PERCEPTION"], ["view", "VOICE"], ["view", "MEMORY"]
  ]);
  assert.equal(ui.calls.at(-1)[0], "log");
  assert.deepEqual(ui.calls.filter(x => x[0] === "ambience").map(x => x[1]), ["FOCUS_40HZ", "NORMAL"]);
  assert.equal(orchestrator.state, "COMPLETED");
  assert.equal(orchestrator.isActive, false);
});

test("critic rejection prevents all view changes and restores NORMAL", async () => {
  const ui = uiFixture();
  const orchestrator = new ExocortexOrchestrator({
    plan: async () => structuredClone(plan),
    critique: async () => ({ approved: false, findings: ["missing evidence"] })
  });
  const result = await orchestrator.startLockIn(plan.mission, ui);
  assert.equal(result.status, "REJECTED_BY_SABOTEUR");
  assert.equal(ui.calls.some(x => x[0] === "view"), false);
  assert.equal(ui.calls.filter(x => x[0] === "ambience").at(-1)[1], "NORMAL");
});

test("STOP aborts in-flight planning and restores NORMAL synchronously", async () => {
  const ui = uiFixture();
  let capturedSignal;
  let finishPlan;
  const orchestrator = new ExocortexOrchestrator({
    plan: (_mission, { signal }) => {
      capturedSignal = signal;
      return new Promise(resolve => { finishPlan = resolve; });
    },
    critique: async () => ({ approved: true, findings: [] })
  });
  const pending = orchestrator.startLockIn(plan.mission, ui);
  await Promise.resolve();
  assert.equal(orchestrator.isActive, true);
  orchestrator.stopLockIn();
  assert.equal(capturedSignal.aborted, true);
  assert.equal(orchestrator.state, "STOPPED");
  assert.equal(orchestrator.isActive, false);
  assert.equal(ui.calls.filter(x => x[0] === "ambience").at(-1)[1], "NORMAL");
  finishPlan(structuredClone(plan));
  const result = await pending;
  assert.equal(result.status, "ABORTED");
  assert.equal(orchestrator.state, "STOPPED");
});

test("invalid plans fail closed and always restore NORMAL", async () => {
  const ui = uiFixture();
  const orchestrator = new ExocortexOrchestrator({
    plan: async () => ({ mission: "bad", steps: [{ id: "x", label: "x", view: "EXECUTE_CODE" }] }),
    critique: async () => ({ approved: true, findings: [] })
  });
  await assert.rejects(() => orchestrator.startLockIn("Test", ui), /LOCK_IN_STEP_INVALID/);
  assert.equal(ui.calls.filter(x => x[0] === "ambience").at(-1)[1], "NORMAL");
  assert.equal(orchestrator.state, "FAILED");
});
