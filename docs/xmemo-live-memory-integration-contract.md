# XMemo live-memory integration contract

Status: SOURCE IMPLEMENTATION EXISTS; DEPLOYED RUNTIME STATUS UNVERIFIED. The default-branch gateway source contains a consent-gated XMemo transport adapter in `supabase/functions/hq-gateway-v12/xmemo-memory.mjs`, wires it in `index.ts`, and includes focused tests in `tests/hq-gateway-v12-xmemo-memory.test.mjs`. The local-chat PR adds a source-level regression test for that gateway wiring. This contract records required controls and remaining release evidence; it does not claim the production edge function has the XMEMO_API_KEY configured or that live read/write has been verified.

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

The existing source adapter is injected into the gateway module. Preserve this boundary in future refactors. A missing adapter must fail closed for writes and return a clear `memory_unavailable` result for reads. Do not silently fall back to local browser storage and present it as canonical XMemo memory.

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

OBSERVED: default-branch source defines the XMemo HTTP adapter, consent gates, UUID-scoped user paths, redaction, bounded requests/responses, timeout handling, and gateway call sites. Focused unit tests cover consent, path isolation, redaction, bounded context, HTTP failures, and transport failures. The local-chat PR adds a static regression assertion that the gateway uses the authenticated user ID and explicit per-request memory_consent for both recall and store.

VALIDATED: the existing adapter test suite is part of the repository CI contract; verify exact-head workflow results before release.

UNPROVEN: production XMEMO_API_KEY configuration, deployed edge-function version, live bidirectional read/write, deployed tenant isolation, deployed read-after-write, deletion/correction workflow, and production reliability. The HQ local browser chat intentionally does not call XMemo or upload local conversation history.

No production credentials, paid services, database permissions, or deployment changes are authorized by this document.
