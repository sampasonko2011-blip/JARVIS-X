import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(env) {
  return spawnSync(process.execPath, ["evaluation/providers.mjs"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
}

test("provider mode fails closed without explicit opt-in", () => {
  const result = run({});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Refusing provider calls/);
});

test("provider mode fails closed when budget limits are missing", () => {
  const result = run({ JARVIS_EVAL_ENABLE_REAL_PROVIDERS: "1", JARVIS_EVAL_ADAPTER: "test-adapter" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /finite positive/);
});

test("provider mode still refuses dispatch when no adapter implementation exists", () => {
  const result = run({
    JARVIS_EVAL_ENABLE_REAL_PROVIDERS: "1",
    JARVIS_EVAL_ADAPTER: "not-implemented",
    JARVIS_EVAL_MAX_CALLS: "2",
    JARVIS_EVAL_MAX_COST_USD: "0.05",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No provider adapter is implemented/);
});
