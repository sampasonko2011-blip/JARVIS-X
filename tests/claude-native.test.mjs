import test from "node:test";
import assert from "node:assert/strict";
import { ClaudeNativeProvider } from "../dist/providers/claude-native.js";

test("Claude native adapter exposes a critique capability", () => {
  const provider = new ClaudeNativeProvider();
  assert.equal(provider.id, "claude-native");
  assert.equal(provider.capabilities[0].id, "claude-native:critique");
  assert.equal(provider.capabilities[0].kind, "critique");
});

test("Claude native adapter does not grant write access through its default path", () => {
  const provider = new ClaudeNativeProvider();
  assert.equal(provider.capabilities[0].metadata.execution, "UNVERIFIED");
});
