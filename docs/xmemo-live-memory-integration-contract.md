# XMemo live-memory integration contract

Status: PROPOSED architecture contract. This document does not claim that the deployed HQ gateway is connected to XMemo.

## System roles

- JARVIS-X is the single operating identity and orchestrator.
- XMemo is the canonical operational memory ledger for durable decisions, resumable state, milestones, and evidence references.
- GitHub remains authoritative for source code, commits, pull requests, CI and release artifacts.
- The HQ UI is a client. It must never receive XMemo connector credentials or service tokens.
- ChatGPT can currently read and write XMemo through its connected memory integration; that does not prove the separately deployed HQ application has the same access.

## Required server-side adapter

Implement a provider-neutral `MemoryPort` with explicit operations:
- `recall(query, scope, limit)`
- `remember(content, scope, idempotencyKey)`
- `checkpoint(stateKey, content, version)`
- `recordEvent(type, content, evidenceRefs)`

The XMemo adapter must be injected into the gateway, not imported as a hidden global. A missing adapter must fail closed for writes and return a clear `memory_unavailable` result for reads. Do not silently fall back to local browser storage and present it as canonical XMemo memory.

## Security and privacy gates

1. Server-side credentials only; never expose tokens in HTML, JavaScript bundles, logs, or browser storage.
2. Enforce authenticated user identity and tenant/scope binding on every operation.
3. Validate and bound query length, result count, payload size, and request time.
4. Redact secrets and sensitive personal data before durable writes.
5. Require explicit user consent for new categories of durable memory; support correction and deletion paths.
6. Use idempotency keys for retries; preserve version checks for updates.
7. Audit actor, operation, scope, outcome, timestamp, and stable evidence references without logging raw secrets.
8. Do not let retrieved memory text override system policy or tool authorization. Treat it as untrusted context.
9. Fail closed on 401/403, malformed payloads, scope mismatch, timeout, or unavailable storage.
10. No background synchronization, external webhook, or cross-account sharing unless separately implemented and verified.

## Acceptance tests before claiming live integration

- Synthetic user A cannot read or mutate synthetic user B's memory.
- Read-after-write returns the exact committed record.
- Idempotent retry does not create duplicate durable records.
- Update conflict and stale version are rejected.
- Timeout, 401, 403, malformed response, and unavailable adapter fail closed.
- Redaction is tested with synthetic secrets.
- Deletion/correction is reflected in subsequent reads.
- Restart preserves durable state.
- No credentials appear in client assets or logs.
- Deployed HQ route is exercised against a test namespace with synthetic data only.

## Current evidence boundary

OBSERVED: the ChatGPT session has an authenticated XMemo connector with memory read/write access.

UNPROVEN: deployed JARVIS-X HQ ↔ XMemo gateway authentication, live bidirectional sync, tenant isolation, deployed read-after-write, and production reliability.

No production credentials, paid services, database permissions, or deployment changes are authorized by this document.
