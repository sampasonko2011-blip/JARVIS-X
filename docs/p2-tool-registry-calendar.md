# P2 — Tool Registry and calendar ingestion

## P2.1 Tool Registry
- Explicit registration with deterministic input/output schema validation.
- Every invocation requires explicit consent; L3 additionally requires separate human approval.
- L4 is rejected in this phase. Non-zero estimated cost is rejected; no provider/network action is implicit.
- Successes and rejections are written to the in-memory EvidenceLedger. This is not durable storage.
- Schema support is intentionally limited; it is not full JSON Schema.

## P2.2 Calendar ingestion
- Parser accepts caller-supplied ICS text, including locally imported files; it is offline-capable.
- Supports line unfolding, VEVENT UID/SUMMARY/DESCRIPTION/DTSTART/DTEND/CATEGORIES and basic classification.
- Does not expand RRULE recurrence, resolve VTIMEZONE/TZID, fetch remote URLs, or authenticate to PRONOTE. Floating times are preserved without timezone conversion.
- Remote URL ingestion is deliberately not implemented: it needs explicit L1 consent, exact HTTPS host allowlist, redirect checks and size/time limits.
- Conflict detection is advisory only and never edits calendars.

## Validation boundary
Unit tests use synthetic ICS fixtures. No live PRONOTE account, remote feed, real calendar write, or physical-device import has been tested.
