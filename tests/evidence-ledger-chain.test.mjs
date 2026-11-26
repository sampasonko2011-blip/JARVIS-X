import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { EvidenceLedger } from "../dist/core/ledger.js";

const entry = (objective) => ({
  objective, constraints: [], capabilitiesAvailable: ["local"],
  capabilitiesInvoked: ["local"], capabilitiesExecuted: ["local"],
  verification: "OBSERVED", errors: [], decision: "UNPROVEN"
});

test("ledger appends a SHA-256 linked chain and verifies it", () => {
  const ledger = new EvidenceLedger();
  const first = ledger.record(entry("first"));
  const second = ledger.record(entry("second"));
  assert.match(first.hash, /^[a-f0-9]{64}$/);
  assert.equal(first.hash.length, 64);
  assert.equal(first.sequence, 0);
  assert.equal(second.sequence, 1);
  assert.equal(second.previousHash, first.hash);
  assert.deepEqual(ledger.verifyIntegrity(), {
    valid: true, checked: 2, headHash: second.hash
  });
});

test("ledger canonical hash is stable across object key order", () => {
  const a = new EvidenceLedger();
  const b = new EvidenceLedger();
  a.record({ ...entry("same"), lesson: "verified" });
  b.record({ ...entry("same"), lesson: "verified" });
  assert.equal(a.all()[0].hash, b.all()[0].hash);
});

test("ledger detects internal entry tampering", () => {
  const ledger = new EvidenceLedger();
  ledger.record(entry("first"));
  ledger.record(entry("second"));
  ledger.entries.reverse();
  const result = ledger.verifyIntegrity();
  assert.equal(result.valid, false);
  assert.equal(result.failureIndex, 0);
  assert.equal(result.reason, "SEQUENCE_MISMATCH");
});

test("ledger returns snapshots so callers cannot mutate stored entries", () => {
  const ledger = new EvidenceLedger();
  const returned = ledger.record(entry("immutable snapshot"));
  returned.objective = "tampered";
  assert.equal(ledger.all()[0].objective, "immutable snapshot");
  assert.equal(ledger.verifyIntegrity().valid, true);
});
