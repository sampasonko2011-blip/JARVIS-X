# JARVIS-X HQ — implementation roadmap

**Status:** staged roadmap plus a read-only audit of source, deployment, and backend state.  
**Current artifact:** PR #58 is merged; GitHub Pages deployment run #40367978570 succeeded for commit `b24881664e8d3951ae1ec1455601e06be474460a`.  
**Current release blocker:** production Supabase `hq-gateway` is still version 11 (`openai` / `gpt-4.1-mini`, three passes of the same model). The five-provider/XMemo implementation in repository source is not the deployed function. Do not describe multi-provider inference or cross-platform memory as live.

## Current evidence snapshot — 2026-10-26

The historical stage notes below describe the intended gates; use this snapshot for the current branch state.

| Capability | Current status | Evidence / boundary |
|---|---|---|
| Static HQ PWA | PUBLISHED on the default branch | PR #58 commit `b24881664e8d3951ae1ec1455601e06be474460a`; Pages run #40367978570 completed successfully. This validates static deployment only. |
| Single JARVIS-X chat identity | VALIDATED in static UI | PR #58 removed the user-facing provider roster. The live backend remains single-primary multipass; identity presentation is not model fusion. |
| Hosted five-provider gateway | SOURCE ONLY / NOT DEPLOYED | Repository source `supabase/functions/hq-gateway/index.ts` contains five-provider orchestration. Live Supabase `hq-gateway` is ACTIVE version 11 with `openai` / `gpt-4.1-mini` and `single-primary-multipass`. The source/deployment mismatch is directly observed. |
| Cross-platform memory | SOURCE ONLY / NOT DEPLOYED | Five-provider source contains per-message consent, user-scoped XMemo paths and redaction. Deployed v11 contains no XMemo recall/write path. The `hq_memory_items` table exists with RLS enabled but has 0 rows; live sync, durability and isolation are unvalidated. |
| Tool broker | GENERIC EXECUTION BOUNDARY implemented; connector execution UNBUILT | `hq/tool-broker-runtime.mjs` requires an injected executor, exact scopes, approval for writes, pre/post audit, output validation and world-state verification. No real connector registry or connector executor is wired into the HQ interface. |
| Composite runtime | IMPLEMENTED as a separate guarded runtime; deployment UNPROVEN | Provider adapters require trusted, fresh attestations. Do not confuse this runtime with the direct five-provider gateway. |
| Budget and rate-limit controls | DEPLOYMENT DRIFT / RELEASE BLOCKER | Live database has migrations only through `20261024185449`; repo also contains `20261026100000_hq_rate_limit_server_only_rpc.sql`, which is not applied. The live v11 gateway calls the older user-scoped RPC. Do not deploy the newer gateway or apply migrations out of sequence. Global spend controls and provider secrets must be verified before billable inference. |
| Offline shell | Service-worker implementation and browser tests present | PR #48 bumps the shell cache to v5; latest branch CI must pass, and real iPad Safari behavior remains untested. |
| Release / live provider verification | UNPROVEN | Static Pages deployment is confirmed. No successful authenticated provider inference, XMemo write/read, or current five-provider gateway deployment is verified. Secret values were not read or changed. |

## Product invariants

1. **Evidence before claims.** Each capability has a state: `PROPOSED`, `IMPLEMENTED`, `TESTED`, `VALIDATED`, or `UNPROVEN`. A successful build proves buildability, not real-world behavior.
2. **Local-first, not local-only by accident.** Clearly indicate where each record lives, whether it is backed up, and whether it has synced.
3. **Least privilege.** No provider, repository, file, browser, or external-tool permission is enabled implicitly.
4. **Secrets stay server-side.** No API keys, session secrets, or privileged credentials in browser assets, local storage, logs, or Git.
5. **Model-agnostic routing.** Compare candidates against the same task, constraints, quality rubric, latency, cost, and failure cases. Do not claim model superiority without comparable evidence.
6. **Human approval gates.** Read-only discovery can precede execution; external writes, publishing, purchases, account changes, and destructive operations require explicit authorization.
7. **Inspectable state.** Every action records the objective, route, source/version, permission scope, result, errors, and verification evidence without recording secrets.

## Delivery stages and acceptance gates

### Stage 0 — Static shell (current)

- [x] Responsive navigation and core work surfaces.
- [x] Device-local task briefs, memory notes, and evidence ledger.
- [x] Local JSON export and deletion controls.
- [x] Backup import with size/shape checks and replacement confirmation.
- [x] PWA manifest and service-worker shell cache.
- [x] Automated static regression checks and existing repository CI.
- [ ] Real browser/device install and offline-reload tests.

**Known boundary:** localStorage is not encrypted vault storage, account identity, a backup service, or cross-device synchronization.

### Stage 1 — Local data integrity

- Add a versioned data schema and explicit migrations.
- Add record IDs, timestamps, and stable validation rules.
- Test malformed imports, oversized imports, duplicate IDs, storage-full errors, and interrupted updates.
- Add a visible last-export timestamp only if it can be persisted reliably.
- Define export/import compatibility and recovery behavior.

**Acceptance:** automated tests cover valid and invalid fixtures; migration tests prove old data remains readable; real-browser tests cover storage failure.

### Stage 2 — Identity and synchronized storage

- Choose a managed identity provider and backend only after explicit product approval.
- Enforce per-user authorization server-side for every read/write; never trust a client-supplied user ID.
- Specify data minimization, retention, deletion, backup, recovery, conflict resolution, and account export.
- Use TLS in transit and managed encryption/key handling at rest; document what is and is not end-to-end encrypted.
- Keep sessions in secure, appropriately scoped cookies where the architecture supports them; implement CSRF protections and rate limits.

**Acceptance:** tests prove cross-account isolation, denied unauthenticated access, session expiry/revocation, deletion semantics, conflict handling, and restore behavior. A UI-only login mock does not pass.

### Stage 3 — Provider gateway

- Add a server-side adapter contract; providers are configured only from approved credentials.
- Use explicit allowlists, timeouts, retry ceilings, cancellation, rate limits, budget ceilings, and secret redaction.
- Normalize outputs while preserving provider/model/version, timing, token/cost metadata when available, and errors.
- Treat provider responses and retrieved web/file content as untrusted data, never as instructions that can grant permissions.
- Add a deterministic offline mode and clear unavailable/failed-provider states.

**Acceptance:** mocked contract tests, credential-leak scans, timeout/retry tests, budget-limit tests, and a provider failure matrix. Never report an API call as executed without a real response ID or equivalent evidence.

### Stage 4 — Orchestration and evidence evaluation

- Route by task requirements, not brand or a fixed “best model” claim.
- Use typed specialist outputs, explicit source citations, an independent critic, and a synthesis stage.
- Evaluate against a versioned task set with holdouts, negative cases, and regression checks.
- Track quality, correctness, latency, cost, coverage, and failure rate separately; avoid unsupported composite scores.
- Keep a human approval checkpoint before consequential tool actions.

**Acceptance:** reproducible evaluation reports show dataset/version, scoring rubric, per-case outcomes, failure examples, confidence limits, and comparison against a baseline.

### Stage 5 — Authorized tools and operations

- Define one capability manifest per integration: scopes, data accessed, actions permitted, confirmation requirements, and rollback behavior.
- Separate read-only discovery from mutations.
- Require confirmation for external writes and destructive actions; record approval and the exact target.
- Use idempotency keys or equivalent safeguards where supported.
- Provide revocation, audit export, and failure recovery.

**Acceptance:** permission-denial, prompt-injection, stale-data, duplicate-action, partial-failure, and rollback tests pass before an integration is enabled.

### Stage 6 — Release and operations

- Publish from a reviewed branch using a documented GitHub-controlled deployment path.
- Add dependency/security scanning, secret scanning, accessibility checks, and end-to-end browser tests.
- Verify actual deployed build/version, installability, cache invalidation, offline behavior, and supported-device matrix.
- Maintain incident response, rollback, backup restoration, and release notes.

**Acceptance:** a live URL is checked against the release commit and tested on real supported devices. CI green alone is not release validation.

## Compact evidence ledger

| Claim | Current status | Evidence / missing proof |
|---|---|---|
| HQ source is in a review branch | OBSERVED | PR #32; verify head SHA before relying on it |
| Existing CI passed before the latest backup-import change | VALIDATED (prior revision only) | Run 39862367514 succeeded at SHA `10f9359f...` |
| Backup import and record deletion added | IMPLEMENTED | Code and regression tests on the feature branch; latest CI must pass |
| Data is encrypted at rest | UNPROVEN / not claimed | Browser localStorage is not an encrypted vault |
| Cross-device sync and authentication work | UNBUILT | No backend or identity provider implemented |
| Model/tool orchestration works | UNBUILT | No provider gateway or tool executor connected |
| App is deployed and install-tested | UNPROVEN | No live deployment or device test established |

## Immediate next action

Finish CI for the newest commit, inspect the changed-file diff, and perform browser-level smoke tests before considering a deployable release. Do not merge or enable external integrations merely because static checks pass.
