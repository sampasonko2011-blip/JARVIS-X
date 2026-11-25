# P5 — Offline-First & Controlled Evolution

**Branch:** `feat/p5-offline-sync-evolution`  
**Default posture:** local-only, no deployment, no paid calls, no automatic remote writes.

## Pillar 1 — Offline outbox

`hq/offline-sync-queue.mjs` provides an IndexedDB outbox with stable idempotency keys, bounded JSON payloads, retryable pending state, interrupted-send recovery, and an explicitly injected transport. No transport is configured by HQ. Payloads are encrypted with AES-GCM-256 before entering IndexedDB. A non-extractable CryptoKey is persisted in a separate object store in the same origin database. This protects raw IndexedDB exports at rest, but **does not protect against same-origin script compromise, XSS, or a compromised browser profile**. Queue metadata (type, idempotency key, timestamps, status and retry count) remains readable. Existing pre-encryption records are lazily encrypted when read; if WebCrypto is unavailable, reads fail closed rather than returning plaintext. It is not a sync service until a reviewed, authenticated, user-scoped transport exists. Never queue credentials, cookies, tokens, or secrets.

Acceptance still required: real Safari/iPad persistence across force-close/reopen, quota behavior, two-tab concurrency, transaction interruption, key-loss recovery, authenticated transport contract review, and a server-side idempotent write API before remote sync.

## Pillar 2 — CRDT and history

`hq/crdt-lww-set.mjs` implements an observed-remove set with per-add tags, tombstones, a hybrid logical clock, deterministic merge ordering, and compensating undo operations. Concurrent adds not observed by a remove are retained. This deterministic data structure is now wired to the authenticated PRONOTE snapshot-read event and local HQ memory-save events: both are normalized, merged into CRDT state, encrypted, and queued locally. It is **not** a multi-device replication protocol. The current PRONOTE bridge only reads snapshots; no authenticated remote mutation endpoint or XMemo queue transport has been identified, so no remote writes or automatic sync are claimed. Schema/version migration and real multi-replica stress tests remain required.

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
