import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("offline harness runs without credentials and labels itself as plumbing-only", () => {
  const result = spawnSync(process.execPath, ["evaluation/run-offline.mjs"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: "true" },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "HARNESS_SELF_TEST_ONLY");
  assert.equal(report.taskSet.count, 4);
  assert.match(report.fixtureManifestSha256, /^[a-f0-9]{64}$/);
  assert.match(report.limitations.join(" "), /not evidence of quality gains/);
});

test("offline harness refuses to overwrite an existing report", () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "jx-eval-"));
  try {
    const output = join(dir, "report.json");
    writeFileSync(output, "keep");
    const result = spawnSync(process.execPath, ["evaluation/run-offline.mjs", output], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal((await import("node:fs")).readFileSync(output, "utf8"), "keep");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
