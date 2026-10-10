import test from "node:test";
import assert from "node:assert/strict";
import { FallbackProvider } from "../dist/providers/fallback-provider.js";

function provider(id, execute, kind = "coding") {
  return { id, capabilities: [{ id: id + ":" + kind, kind, strengths: [kind] }], execute };
}
const request = { task: { id: "test", objective: "test", constraints: [] }, role: "coding", context: {} };

test("falls through unavailable zero-cost candidate to next eligible candidate", async () => {
  const first = provider("offline", async () => { throw new Error("offline"); });
  const second = provider("local", async () => ({ capabilityId: "local:coding", output: "ok" }));
  const fallback = new FallbackProvider("fallback", [
    { provider: first, costClass: "verified-zero-cost" },
    { provider: second, costClass: "verified-zero-cost" },
  ]);
  assert.equal((await fallback.execute(request)).output, "ok");
});

test("paid, trial, unknown, and disabled candidates are not routed by default", async () => {
  let called = false;
  const p = provider("must-not-run", async () => { called = true; return { capabilityId: "x", output: "x" }; });
  const fallback = new FallbackProvider("fallback", [
    { provider: p, costClass: "paid" },
    { provider: p, costClass: "trial" },
    { provider: p, costClass: "unknown" },
    { provider: p, costClass: "verified-zero-cost", enabled: false },
  ]);
  await assert.rejects(fallback.execute(request), /zero-cost policy is fail-closed/);
  assert.equal(called, false);
});

test("reports failure if every eligible provider fails", async () => {
  const p = provider("down", async () => { throw new Error("unavailable"); });
  const fallback = new FallbackProvider("fallback", [{ provider: p, costClass: "verified-zero-cost" }]);
  await assert.rejects(fallback.execute(request), /All eligible providers failed/);
});
