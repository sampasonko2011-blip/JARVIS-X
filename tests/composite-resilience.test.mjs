import test from "node:test";
import assert from "node:assert/strict";
import { CompositeEngine } from "../dist/core/composite.js";

const task = { id: "composite-resilience", objective: "produce and verify a result", constraints: [] };

function provider(id, { output = "ok", throws = false, capabilities = ["reasoning"] } = {}) {
  return {
    id,
    capabilities: capabilities.map((kind, index) => ({
      id: id + ":" + index,
      kind: kind === "critique" ? "critique" : "reasoning",
      strengths: [kind],
    })),
    async execute() {
      if (throws) throw new Error("simulated provider outage");
      return {
        capabilityId: id + ":executed",
        output,
        evidence: [{ source: id, claim: "fixture output", status: "OBSERVED" }],
      };
    },
  };
}

function member(id, capabilities = ["reasoning"]) {
  return { providerId: id, capabilities, utilityScore: 10, status: "VALIDATED" };
}

test("composite isolates one provider outage and retains verified survivor outputs", async () => {
  const providers = [
    provider("a"),
    provider("b", { throws: true }),
    provider("critic", { capabilities: ["critique"] }),
  ];
  const engine = new CompositeEngine(providers, {
    minMembers: 3,
    maxMembers: 3,
    requireIndependentCritic: true,
    parallelize: true,
  });
  const result = await engine.run(
    task,
    [member("a"), member("b"), member("critic", ["critique"])],
    response => response.output === "ok",
  );

  assert.equal(result.proposals.length, 3);
  assert.equal(result.selected.length, 2);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.verification, "VALIDATED");
  assert.match(result.rejected[0].evidence[0].claim, /simulated provider outage/);
});

test("composite invokes each verifier exactly once per proposal", async () => {
  const engine = new CompositeEngine([
    provider("a"),
    provider("b"),
    provider("critic", { capabilities: ["critique"] }),
  ], {
    minMembers: 3,
    maxMembers: 3,
    requireIndependentCritic: true,
    parallelize: true,
  });
  let calls = 0;
  const result = await engine.run(
    task,
    [member("a"), member("b"), member("critic", ["critique"])],
    () => { calls += 1; return true; },
  );

  assert.equal(calls, 3);
  assert.equal(result.verification, "VALIDATED");
});

test("composite fails closed when the critic output does not survive verification", async () => {
  const engine = new CompositeEngine([
    provider("a"),
    provider("b"),
    provider("critic", { capabilities: ["critique"] }),
  ], {
    minMembers: 3,
    maxMembers: 3,
    requireIndependentCritic: true,
    parallelize: true,
  });
  const result = await engine.run(
    task,
    [member("a"), member("b"), member("critic", ["critique"])],
    response => response.capabilityId !== "critic:executed",
  );

  assert.equal(result.verification, "UNPROVEN");
  assert.match(result.rationale.join(" "), /no critic output survived/);
});
