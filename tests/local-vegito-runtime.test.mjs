import assert from "node:assert/strict";
import test from "node:test";
import { createLocalVegitoRuntime } from "../hq/local-vegito-runtime.mjs";

const model = "qwen2.5:3b";
const registry = { agents: [{
  id: "local-engineer", kind: "local-specialist", roles: ["engineering"],
  activation: "ENABLED", status: "VALIDATED", independenceGroup: "local-device-runtime",
  allowedTools: ["local_model_inference"], dataAccessScope: "explicit-test-fixture-only"
}] };
function spawnFactory() {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === "list") return { status: 0, stdout: "NAME ID SIZE MODIFIED\nqwen2.5:3b abc 2GB now\n", stderr: "" };
    return { status: 0, stdout: "Local model result", stderr: "" };
  };
  return { spawn, calls };
}
test("local Vegito binds specialist work and executive synthesis to the same local Ollama model", async () => {
  const { spawn, calls } = spawnFactory();
  const runtime = createLocalVegitoRuntime({
    model, registry, spawn,
    authorize: async ({ agentId, role, tool }) => agentId === "local-engineer" && role === "engineering" && tool === "local_model_inference",
    verify: async result => typeof result?.output?.text === "string" && result.output.text.length > 0,
    verifySynthesis: async answer => answer === "Local model result"
  });
  const result = await runtime.run({
    objective: "Inspect this explicitly selected fixture",
    stages: [{ id: "engineering", agentId: "local-engineer", role: "engineering", tool: "local_model_inference" }]
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.specialistRuns, 1);
  assert.equal(result.executive.synthesisCount, 1);
  assert.equal(calls.filter(call => call.args[0] === "run").length, 2);
  assert.ok(calls.every(call => call.options.env.OLLAMA_NO_CLOUD === "1"));
  assert.ok(calls.every(call => call.options.env.OPENAI_API_KEY === undefined));
});
test("local Vegito fails closed when authorization denies specialist inference", async () => {
  const { spawn, calls } = spawnFactory();
  const runtime = createLocalVegitoRuntime({
    model, registry, spawn,
    authorize: async () => false, verify: async () => true,
    verifySynthesis: async () => true
  });
  const result = await runtime.run({
    objective: "Must not invoke a denied local worker",
    stages: [{ id: "engineering", agentId: "local-engineer", role: "engineering", tool: "local_model_inference" }]
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(calls.filter(call => call.args[0] === "run").length, 0);
});
