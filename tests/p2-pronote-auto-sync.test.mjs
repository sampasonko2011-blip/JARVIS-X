import test from "node:test";
import assert from "node:assert/strict";
import { PRONOTE_AUTO_SYNC_ID, createPronoteSnapshot, evaluatePronoteFreshness, pushPronoteSnapshot } from "../dist/core/pronote-auto-sync.js";

const event = {
  uid: "synthetic-homework",
  summary: "Synthetic homework",
  description: "",
  kind: "homework",
  start: "2026-11-26T16:00:00.000Z",
  end: "2026-11-26T16:30:00.000Z",
  allDay: false,
  source: "pronote",
  timezone: "Africa/Dakar",
  recurrenceInstance: false
};
const now = () => new Date("2026-11-25T10:00:00.000Z");
const snapshot = () => createPronoteSnapshot([event], { now: now(), lastSuccessfulSync: "2026-11-25T09:00:00.000Z" });

test("adapter is registered under the stable pronote.auto-sync identifier", () => {
  assert.equal(PRONOTE_AUTO_SYNC_ID, "pronote.auto-sync");
});

test("pronote.snapshot.v1 exposes freshness and sync state without secrets", () => {
  const value = snapshot();
  assert.equal(value.schemaVersion, "pronote.snapshot.v1");
  assert.equal(value.last_successful_sync, "2026-11-25T09:00:00.000Z");
  assert.equal(value.sync_status, "idle");
  assert.equal(value.data_freshness, "fresh");
  assert.equal(value.last_attempt_at, null);
  assert.equal(evaluatePronoteFreshness(null, now()), "unknown");
  assert.equal(evaluatePronoteFreshness("2026-11-20T09:00:00.000Z", now()), "stale");
});

test("snapshot rejects malformed events and oversized collections", () => {
  assert.throws(() => createPronoteSnapshot([{ ...event, end: event.start }]), /event_invalid/);
  assert.throws(() => createPronoteSnapshot(Array(5001).fill(event)), /events_invalid/);
});

test("snapshot rejects duplicate event identifiers", () => {
  assert.throws(() => createPronoteSnapshot([event, event]), /duplicate_event/);
});

test("push accepts only allowlisted HTTPS endpoints and does not request a token for rejected hosts", async () => {
  let tokenRequested = false;
  const result = await pushPronoteSnapshot(snapshot(), {
    endpoint: "http://example.test/snapshot",
    allowedHosts: ["example.test"],
    getAccessToken: async () => { tokenRequested = true; return "synthetic"; },
    now
  });
  assert.equal(result.sync_status, "rejected");
  assert.equal(tokenRequested, false);
});

test("expired remote sessions preserve the previous successful sync timestamp", async () => {
  const previous = snapshot().last_successful_sync;
  const result = await pushPronoteSnapshot(snapshot(), {
    endpoint: "https://workspace.example.test/pronote",
    allowedHosts: ["workspace.example.test"],
    getAccessToken: async () => "synthetic-token",
    fetchImpl: async () => new Response(null, { status: 401 }),
    now
  });
  assert.equal(result.sync_status, "session_expired");
  assert.equal(result.last_successful_sync, previous);
  assert.equal(result.data_freshness, "fresh");
});

test("successful push uses HTTPS bearer auth and an idempotency key", async () => {
  let captured;
  const result = await pushPronoteSnapshot(snapshot(), {
    endpoint: "https://workspace.example.test/pronote",
    allowedHosts: ["workspace.example.test"],
    getAccessToken: async () => "synthetic-token",
    fetchImpl: async (_url, init) => { captured = init; return new Response(null, { status: 202 }); },
    now
  });
  assert.equal(result.sync_status, "success");
  assert.equal(result.last_successful_sync, now().toISOString());
  assert.equal(result.data_freshness, "fresh");
  assert.equal(captured.headers.authorization, "Bearer synthetic-token");
  assert.match(captured.headers["idempotency-key"], /^[a-f0-9]{64}$/);
  assert.equal(captured.redirect, "error");
  assert.equal(JSON.stringify(result).includes("synthetic-token"), false);
});

test("network and server failures never advance last_successful_sync", async () => {
  const previous = snapshot().last_successful_sync;
  const result = await pushPronoteSnapshot(snapshot(), {
    endpoint: "https://workspace.example.test/pronote",
    allowedHosts: ["workspace.example.test"],
    getAccessToken: async () => "synthetic-token",
    fetchImpl: async () => { throw new Error("network down"); },
    now
  });
  assert.equal(result.sync_status, "network_error");
  assert.equal(result.last_successful_sync, previous);
});
