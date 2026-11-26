# JARVIS-X — iPad Air 5 physical validation

**Target:** iPad Air 5 (M1), Safari, current installed iPadOS.  
**Rule:** run only after a reviewed build is available. Do not treat Playwright desktop emulation as device evidence.

Record: date/time, iPadOS version, Safari version, build/commit, network state, expected result, observed result, status, and a screenshot or short recording reference. Avoid personal school records, credentials, tokens, and private audio in evidence.

## P4 carry-over

- [ ] Install/open HQ in Safari; verify navigation and viewport at portrait and landscape.
- [ ] Import a text PDF and verify extracted text is actually present in the coach support.
- [ ] Import a scanned/image-only PDF; confirm explicit no-text-layer status (no false OCR claim).
- [ ] Draw with Apple Pencil; confirm pressure variation only if the browser exposes pressure.
- [ ] Export annotations and reopen the export.
- [ ] Test FR, EN and ES speech synthesis with voices actually installed.
- [ ] Activate microphone only by explicit tap; verify visible listening state and stop control.
- [ ] Test interruption/barge-in manually; record whether the browser/device actually supports it.
- [ ] Load the local Qwen model only with explicit consent and sufficient device resources; record model ID, quantization, runtime, first-token/total latency, errors, and whether WebGPU is available. Do not compare against an unrun model.

## P5 local durability

- [ ] Enqueue a non-sensitive test mutation while online; verify it appears as PENDING in the local outbox.
- [ ] Inspect IndexedDB metadata and confirm payload fields are ciphertext + IV (no plaintext payload property).
- [ ] Verify the AES-GCM CryptoKey is non-extractable and survives Safari close/reopen on the same origin.
- [ ] Verify raw IndexedDB export does not reveal the synthetic test payload; do not attempt to bypass device security.
- [ ] Switch to Airplane Mode; enqueue another test mutation and confirm it remains local.
- [ ] Close Safari completely and reopen; verify both records remain in IndexedDB.
- [ ] Restart HQ; verify records are still pending and no remote send is claimed.
- [ ] Verify network restoration does not trigger an automatic XMemo send.
- [ ] Sign in and link XMemo; test the explicit consent checkbox + confirmation with synthetic content only.
- [ ] Confirm XMemo receives the test record; verify status changes to STORED only after the server response.
- [ ] Simulate interrupted/ambiguous delivery; verify status becomes DELIVERY_UNKNOWN and retry is blocked until manual XMemo inspection.
- [ ] Export or inspect local queue state without exposing sensitive payloads.
- [ ] Verify payload-size rejection and malformed-payload rejection.
- [ ] Verify duplicate idempotency keys do not create duplicate records.
- [ ] Verify an interrupted send recovers to DELIVERY_UNKNOWN, not PENDING.
- [ ] After manually confirming the record is absent from XMemo, explicitly return it to PENDING and retry.

## P5 conflict and evolution gates

- [ ] Run a two-replica test fixture and compare merged results on both replicas.
- [ ] Verify an unseen concurrent add survives an observed remove.
- [ ] Verify undo creates a compensating operation and preserves history.
- [ ] Submit a deliberately failing regression report; confirm L3 approval is blocked.
- [ ] Submit a passing report; confirm proposal remains inert until human approval.
- [ ] Confirm activation requires a second explicit confirmation and adapter.
- [ ] Confirm no background prompt/rule mutation occurs.

## Sync is not validated until

- [ ] A reviewed authenticated transport is configured with least privilege.
- [ ] Remote idempotency is guaranteed server-side before claiming exactly-once delivery.
- [ ] Two separately authorized devices complete an idempotent round-trip.
- [ ] Server-side authorization and cross-account isolation are tested.
- [ ] Offline edits, concurrent edits, retries, duplicate delivery, revocation, and recovery are tested.
- [ ] Server acknowledgements and resulting world state are independently observed.

**Current initial status:** all physical checks NOT RUN. This checklist is a plan, not evidence of device behavior.
