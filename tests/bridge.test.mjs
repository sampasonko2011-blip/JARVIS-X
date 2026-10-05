import test from "node:test";
import assert from "node:assert/strict";
import { authorizeBridgeRound } from "../dist/core/bridge-policy.js";

test("bridge policy rejects rounds beyond recursion guard", () => {
  const policy = { maxRounds: 2, maxPromptChars: 100, maxOutputChars: 1000, timeoutMs: 1000, allowWrite: false, allowedExecutables: ["claude"] };
  assert.equal(authorizeBridgeRound(policy, 3, "test").allowed, false);
});

test("bridge policy rejects write mode unless explicitly enabled", () => {
  const policy = { maxRounds: 2, maxPromptChars: 100, maxOutputChars: 1000, timeoutMs: 1000, allowWrite: false, allowedExecutables: ["claude"] };
  assert.equal(authorizeBridgeRound(policy, 1, "test", "write").allowed, false);
});