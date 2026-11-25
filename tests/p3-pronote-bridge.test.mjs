import test from "node:test";
import assert from "node:assert/strict";
import { validatePronoteSnapshot, canonicalSnapshot, sha256Hex } from "../src/core/pronote-bridge-contract.mjs";
import { parseICalendar } from "../dist/core/icalendar.js";

const event = {
  uid: "homework-1", summary: "Math homework", description: "Exercises 4–6",
  kind: "homework", start: "2026-11-26T15:00:00.000Z", end: "2026-11-26T16:00:00.000Z",
  allDay: false, source: "pronote", timezone: "Africa/Dakar", recurrenceInstance: false
};
const snapshot = { schemaVersion: "pronote.snapshot.v1", source: "pronote", generatedAt: "2026-11-25T12:00:00.000Z", events: [event] };

test("accepts a well-formed versioned PRONOTE snapshot", () => {
  assert.deepEqual(validatePronoteSnapshot(snapshot), { valid: true, errors: [] });
});

test("rejects wrong schema, non-PRONOTE source and duplicate event identifiers", () => {
  assert.equal(validatePronoteSnapshot({ ...snapshot, schemaVersion: "v0" }).valid, false);
  assert.equal(validatePronoteSnapshot({ ...snapshot, source: "unknown" }).valid, false);
  assert.equal(validatePronoteSnapshot({ ...snapshot, events: [event, event] }).valid, false);
});

test("rejects malformed dates, event fields and oversized event collections", () => {
  assert.equal(validatePronoteSnapshot({ ...snapshot, events: [{ ...event, end: event.start }] }).valid, false);
  assert.equal(validatePronoteSnapshot({ ...snapshot, events: Array(2001).fill(event) }).valid, false);
  assert.equal(validatePronoteSnapshot({ ...snapshot, events: [{ ...event, description: "x".repeat(5001) }] }).valid, false);
});

test("canonical snapshot hash is stable across event order and changes with content", async () => {
  const second = { ...event, uid: "homework-2" };
  const a = await sha256Hex(canonicalSnapshot({ ...snapshot, events: [event, second] }));
  const b = await sha256Hex(canonicalSnapshot({ ...snapshot, events: [second, event] }));
  const c = await sha256Hex(canonicalSnapshot({ ...snapshot, events: [{ ...event, summary: "Changed" }, second] }));
  assert.equal(a, b);
  assert.notEqual(a, c);
  const icsA = await sha256Hex(canonicalSnapshot({ ...snapshot, freshnessBasis: "ingestion_time_only", generatedAt: "2026-11-25T12:00:00.000Z" }));
  const icsB = await sha256Hex(canonicalSnapshot({ ...snapshot, freshnessBasis: "ingestion_time_only", generatedAt: "2026-11-26T12:00:00.000Z" }));
  assert.equal(icsA, icsB);
});

test("official-style iCalendar events are parsed into normalized PRONOTE events", () => {
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    "UID:school-ics-001", "DTSTART:20261126T090000Z", "DTEND:20261126T100000Z",
    "SUMMARY:Cours de mathématiques", "DESCRIPTION:Chapter 4", "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
  const events = parseICalendar(ics, "pronote", { rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2027-01-01T00:00:00Z" });
  assert.equal(events.length, 1);
  assert.equal(events[0].uid, "school-ics-001");
  assert.equal(events[0].source, "pronote");
  assert.equal(events[0].kind, "school");
});

test("iCalendar parser rejects invalid envelopes and empty calendars", () => {
  assert.throws(() => parseICalendar("BEGIN:VCALENDAR\r\nEND:VCALENDAR", "pronote"), /no VEVENT/);
  assert.throws(() => parseICalendar("BEGIN:VEVENT\r\nEND:VEVENT", "pronote"), /envelope/);
});
