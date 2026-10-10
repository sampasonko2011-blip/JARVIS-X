import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("offline harness runs without credentials or network and labels itself honestly", () => {
  const result = spawnSync(process.execPath, ["evaluation/run-offline.mjs"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_SHA: "test-sha" },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "HARNESS_SELF_TEST_ONLY");
  assert.equal(report.taskSet.count, 4);
  assert.equal(report.pairedOutcomes.fusionWins, 0);
  assert.ok(report.fixtureManifestSha256);
  assert.ok(report.limitations.some(item => item.includes("not evidence of quality gains")));
});

test("provider runner fails closed without explicit opt-in", () => {
  const result = spawnSync(process.execPath, ["evaluation/providers.mjs"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Refusing provider calls/);
});
