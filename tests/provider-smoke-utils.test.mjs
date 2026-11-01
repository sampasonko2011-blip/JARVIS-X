import test from "node:test";
import assert from "node:assert/strict";
import { identityMatches, hasExpectedArithmeticResult } from "../scripts/provider-smoke-utils.mjs";

test("provider identity accepts exact IDs and provider version suffixes", () => {
  assert.equal(identityMatches("gemini-3.0-flash", "gemini-3.0-flash"), true);
  assert.equal(identityMatches("claude-sonnet-4-5-20250929", "claude-sonnet-4-5"), true);
  assert.equal(identityMatches("other-model", "gemini-3.0-flash"), false);
  assert.equal(identityMatches("", "gemini-3.0-flash"), false);
  assert.equal(identityMatches("gemini-3.0-flash", ""), false);
});

test("arithmetic smoke assertion matches 323 as a standalone integer", () => {
  assert.equal(hasExpectedArithmeticResult("323"), true);
  assert.equal(hasExpectedArithmeticResult("Result: 323."), true);
  assert.equal(hasExpectedArithmeticResult("1323"), false);
  assert.equal(hasExpectedArithmeticResult("3230"), false);
  assert.equal(hasExpectedArithmeticResult("three hundred twenty-three"), false);
  assert.equal(hasExpectedArithmeticResult(""), false);
});
