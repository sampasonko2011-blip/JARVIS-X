# P5 — Offline-First & Controlled Evolution

**Branch:** `feat/p5-offline-sync-evolution`  
**Default posture:** local-only, no deployment, no paid calls, no automatic remote writes.

## Pillar 1 — Offline outbox

`hq/offline-sync-queue.mjs` provides an IndexedDB outbox with stable idempotency keys, bounded JSON payloads, retryable pending state, interrupted-send recovery, and an explicitly injected transport. No transport is configured by HQ. The current queue stores plaintext in the browser origin's IndexedDB; it is **not encrypted at rest**. It is not a sync service until a reviewed, authenticated, user-scoped transport exists. Never queue credentials, cookies, tokens, or secrets.

Acceptance still required: real Safari/iPad persistence across force-close/reopen, quota behavior, two-tab concurrency, transaction interruption, and explicit authenticated transport contract review.

## Pillar 2 — CRDT and history

`hq/crdt-lww-set.mjs` implements an observed-remove set with per-add tags, tombstones, a hybrid logical clock, deterministic merge ordering, and compensating undo operations. Concurrent adds not observed by a remove are retained. This is a deterministic local data structure, not yet wired to PRONOTE/XMemo sync or a multi-device replication protocol. Schema/version migration and real multi-replica stress tests remain required.

## Pillar 3 — L3 controlled evolution

`hq/l3-evolution-gate.mjs` records a candidate, baseline identifier, regression-suite outcome and evidence references. Activation requires a passing non-empty suite, a named human approval, exact suite match, and a separate explicit activation confirmation plus an injected activation adapter. This module does not edit or activate prompts/rules by itself. Durable approval identity, signed evidence, artifact digest binding, role-based authorization and audit storage remain future gates.

## Pillar 4 — iPad physical validation

See [ipad-physical-validation.md](./ipad-physical-validation.md). Automated CI is not a substitute for testing Safari on the actual iPad. Record each result with date, iPadOS/Safari version, network state, expected result, observed result, and evidence reference. Do not enter account credentials or personal school data into diagnostic logs.

## Status vocabulary

- **IMPLEMENTED:** source exists.
- **UNIT-TESTED:** deterministic tests pass.
- **BROWSER-TESTED:** Playwright passes in CI.
- **DEVICE-VALIDATED:** physically tested on target iPad.
- **SYNC-VALIDATED:** authenticated multi-device round-trip and conflict recovery independently observed.

Unknown is not success. A queued local record is not a synced record.
