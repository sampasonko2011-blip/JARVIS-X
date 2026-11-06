import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalAuthority } from "../dist/core/approval-authority.js";

const secret = new Uint8Array(32).fill(7);
function harness() {
  const used = new Set();
  const keys = { async getSigningKey(id) { return id === "test-key" ? secret : undefined; } };
  const replay = { async consumeOnce(jti) { if (used.has(jti)) return false; used.add(jti); return true; } };
  return new ApprovalAuthority(keys, replay);
}
const input = {
  subject: "user-1", action: "deploy", resource: "service/api", scope: "staging-only",
  candidateRevision: "abc123", audience: "jarvis-x-gateway", policyVersion: "v1",
  keyId: "test-key", ttlSeconds: 60
};
const context = {
  authenticatedSubject: "user-1", action: "deploy", resource: "service/api",
  scope: "staging-only", candidateRevision: "abc123", audience: "jarvis-x-gateway",
  policyVersion: "v1", now: 1_000_000
};

test("ApprovalAuthority verifies exact scope and consumes a token once", async () => {
  const authority = harness();
  const token = await authority.issue(input, "user-1", context.now);
  assert.equal(await authority.verifyAndConsume(token, context), true);
  assert.equal(await authority.verifyAndConsume(token, context), false);
});

test("ApprovalAuthority rejects payload tampering and mismatched scope", async () => {
  const authority = harness();
  const token = await authority.issue(input, "user-1", context.now);
  const tampered = { ...token, payload: { ...token.payload, scope: "production" } };
  assert.equal(await authority.verifyAndConsume(tampered, context), false);
  assert.equal(await authority.verifyAndConsume(token, { ...context, candidateRevision: "changed" }), false);
});

test("ApprovalAuthority rejects wrong issuer, expiry and unavailable keys", async () => {
  const authority = harness();
  await assert.rejects(() => authority.issue(input, "attacker", context.now), /does not match/);
  const token = await authority.issue(input, "user-1", context.now);
  assert.equal(await authority.verifyAndConsume(token, { ...context, now: token.payload.expiresAt }), false);
  const unavailable = new ApprovalAuthority({ async getSigningKey() { return undefined; } }, { async consumeOnce() { return true; } });
  assert.equal(await unavailable.verifyAndConsume(token, context), false);
});
