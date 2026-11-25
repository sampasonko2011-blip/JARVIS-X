# P3 — Agent Factory, AI Builder and real PRONOTE bridge

Status: implementation plan on `feat/p3-agent-factory-pronote-ipad-bridge`.
Cost policy: 0 EUR by default. No provider calls, model downloads, deployments, secrets, or production mutations.

## Verified starting point

- P2.3 was merged by squash into `main` as `5b54b585f5fcb10464fb8edeaa2026768ae2406d`.
- The `main` ref compared identical to that merge commit immediately after merge.
- This P3 branch already exists and points to that same merge commit. It was not recreated.
- PRONOTE adapter in P2 accepts a caller-supplied snapshot. It does not log into PRONOTE or read Safari sessions.
- Existing forge runners are optional local execution surfaces. Docker runner requires a pre-cached digest-pinned image and model; it never pulls. Ollama runner is local inference, not a hardened sandbox.

## P3 architecture

One executive orchestrator owns one task graph, one budget, one evidence ledger, one shared cancellation signal, one final synthesis and one cleanup pass. Specialist agents are ephemeral capabilities, not separate user-facing assistants.

### 1. Agent Factory — bounded mitosis and apoptosis

- Input: a typed task, domain, constraints, acceptance criteria and an explicit execution budget.
- Domains: school, football, code, research, plus a general coordinator.
- Planner: deterministic, policy-bounded decomposition into small tasks. No model call is required for the baseline implementation.
- Hard limits: maximum task depth, child count, total invocations, wall-clock time, input/output bytes and estimated spend (default 0 EUR).
- Each child receives only the minimum task context and scoped tools. No inherited credentials, unrestricted filesystem, arbitrary network or cross-user memory.
- Scheduler: bounded concurrency; cancellation propagates to all children; timeouts and failures are recorded.
- SaboteurAgent: adversarially checks acceptance criteria, contradictions, unsupported claims, unsafe actions, budget overrun and missing evidence. It cannot silently approve its own output.
- Evidence Ledger: records objective, plan, available/invoked/executed capabilities, per-child result, validation state, cost estimate, errors and lessons.
- Apoptosis: clear child references, buffers and temporary artifacts after synthesis; retain only explicitly permitted, redacted evidence records. No claim of secure memory erasure from JavaScript garbage-collected memory.
- Final output: one synthesized result with OBSERVED / VALIDATED / PROPOSED / UNPROVEN / REJECTED / SUPERSEDED labels.

### 2. AI Builder — sandbox-first tool generation

- Generated tool code is an untrusted proposal, never executable by default.
- Pipeline: draft -> static validation -> schema and permission review -> SaboteurAgent adversarial tests -> sandbox test -> evidence receipt -> explicit L3 human approval -> separately authorized activation.
- Default sandbox: offline, read-only, digest-pinned, no host secrets, bounded CPU/RAM/PIDs/time/output. Reuse the existing isolated runner only where its prerequisites are already installed locally.
- No automatic image/model downloads, package installs, paid calls, repository secrets, production deployment or L4 permissions.
- L3 approval applies to the exact artifact hash, requested permissions, inputs, outputs and budget. Any artifact or permission change invalidates approval.
- A passing sandbox test is not proof of safety against every runtime escape and is not production authorization.

### 3. Real PRONOTE bridge — iPad Air 5, zero-cost first

- Preferred first path: Apple Shortcuts native automation plus a locally generated JSON/iCalendar snapshot, sent by HTTPS POST to the already allowlisted JARVIS-X ingestion endpoint.
- The Shortcut must not put the PRONOTE password, QR code, session cookie, API token or private student data into Git, ChatGPT messages, URLs, logs or screenshots.
- Any bearer token is created and scoped separately, stored only in a user-controlled secure location if the chosen iPadOS action supports it, and revocable. If secure local storage cannot be demonstrated, use a user-confirmed manual export/import path instead.
- The bridge must validate schema/version, event count, event IDs, timestamps, source identity, request size, freshness and idempotency. Reject duplicate events and replayed/expired credentials. Never treat an HTTP 2xx alone as proof that the right student data arrived.
- Workspace shows data provenance, last successful sync, last attempt, freshness and explicit session-expired/network-error states. No automatic calendar writes; L3 review remains advisory until a separate write-capable flow is designed and approved.
- iCalendar is a timetable fallback only; it does not guarantee homework, grades or evaluations.
- Do not use a private API wrapper or scrape Safari as the default design. Official PRONOTE/ENT exports and user-authorized native app sharing take precedence.

### 4. Three real-device acceptance proofs

1. **Locked-screen execution:** a scheduled Shortcut runs on the actual iPad Air 5 while locked, with an observable timestamp and successful receipt. If iPadOS requires unlock or an action is blocked, record the limitation; do not claim background autonomy.
2. **Real data arrival:** a synthetic canary plus a user-selected real PRONOTE export is ingested; verify expected event counts and a small set of user-confirmed event fields in Workspace. Redact names, class details and personal data from logs/screenshots.
3. **Freshness and expiry:** demonstrate a fresh receipt, stale transition and expired/revoked token alert without exposing the token. Confirm that failed attempts do not advance last_successful_sync.

These proofs require the physical iPad and the user's own PRONOTE/ENT session. CI fixtures cannot substitute for them.

## Commit sequence and gates

1. P3.0 architecture and threat-boundary document.
2. P3.1 bounded Agent Factory planner/scheduler, cancellation, ledger and apoptosis tests.
3. P3.2 SaboteurAgent independent review and adversarial tests.
4. P3.3 AI Builder artifact lifecycle, immutable approval binding and offline sandbox integration tests.
5. P3.4 PRONOTE JSON snapshot ingestion contract, replay/idempotency/freshness tests and privacy-safe receipts.
6. P3.5 Apple Shortcuts setup guide with exact supported actions and a manual fallback; no credential collection.
7. P3.6 full unit/build/Playwright/security regression suite and evidence report.

Each step is one commit on this branch. Stop on a failed gate; no force-push, merge, deploy, secret read, model download or paid call without separate authorization.

## Explicitly unproven until device testing

- Whether the user's installed iPadOS version can execute the required Shortcut actions while the device is locked.
- Whether PRONOTE's official export/share surface provides the desired homework/evaluation fields.
- Whether a user-authorized token can be stored and refreshed safely in the chosen native workflow.
- Whether the configured ingestion endpoint accepts and persists the snapshot with correct user isolation.
- Whether real school records appear correctly in Workspace.

## Security and privacy non-goals

No credential harvesting, session-cookie extraction, bypass of PRONOTE authentication, unattended account scraping, hidden background surveillance, automatic schedule mutation, or storage of identifiable school data in public repository artifacts.
