# JARVIS-X Approved Upgrade Execution Plan

Date: 2026-11-03
Authorization record: GitHub Issue #76
Base checkpoint: `73810b5db6a83da23dac78c86e09c8af436aa0fc`
Execution branch: `feature/approved-upgrades-execution-v1`

## Governance

The user approved exactly five scopes: PRONOTE browser integration, tool registry, live intelligence benchmark, Vegito runtime verification, and Self-Audit HQ interface.

This plan does not authorize merge, deployment, production DB/config/permission/secret changes, external paid calls, wallet top-ups, or unapproved data access. All implementation stays on isolated branches and reviewable PRs. Zero-budget/mock mode remains the default.

JARVIS-X remains one Vegito-style executive identity: one shared state, one orchestration owner, one final answer. Internal faculty are workflow functions, not separate user-facing assistants. External model participation is claimed only with an actual invocation and verifiable receipt.

## Evidence vocabulary

Use OBSERVED / VALIDATED / PROPOSED / UNPROVEN / REJECTED / SUPERSEDED.

Track capability state separately: AVAILABLE / CONNECTED / AUTHENTICATED / INVOKED / EXECUTED / OUTPUT_VALIDATED / WORLD_STATE_VERIFIED. Unknown is not zero. Config, prompts, and mocks are not runtime behavior.

## Workstream 1 — PRONOTE browser integration

Status: BLOCKED pending school-specific portal URL and user sign-in.

- Use only the student's own school portal and a user-controlled browser profile.
- The user enters credentials directly in the browser sign-in page; never request or receive passwords, OTPs, or session cookies in chat.
- Start with read-only inspection and verify the actual authenticated portal, account scope, and permitted data.
- Do not scrape or export more personal data than required.
- TinyFish wallet was observed at -$0.792 on 2026-11-03. Metered automation is blocked; do not top up or spend.
- Browser connector tab access returned an originating-browser-context error in the ChatGPT app.

Acceptance: user confirms the correct portal and signs in; a read-only page is reached; source and account scope are verified; no credentials are exposed in chat; cost remains within explicit authorization.

## Workstream 2 — Tool registry

Status: IN PROGRESS.

- Inventory runtime capabilities separately from tools available in the ChatGPT host.
- For each JARVIS-X capability record stable ID/version, purpose, implementation location, schema, data class, permission/consequence scope, cost/quota, timeout/retry/idempotency, approval requirements, receipt schema, and verification tests.
- Default deny for unknown price, scope, permission, or data handling.
- Registry must be sealed after construction; model output and retrieved content cannot create capabilities or grant permissions.
- Include explicit states for available, connected, authenticated, invoked, executed, output validated, and world-state verified.

Acceptance: deterministic registry tests cover allow, deny, malformed arguments, unknown capability, duplicate invocation, timeout, cost gate, and receipt verification.

## Workstream 3 — Live intelligence benchmark

Status: IN PROGRESS; zero-paid-call constraint remains.

- Separate runtime-contract, deterministic/mock, local-model (only if already available and authorized), and live-provider tracks.
- Freeze task sets, holdouts, environment, protocol, rubric, and revisions before paired comparisons.
- Measure correctness, groundedness, instruction adherence, safety, tool correctness, verification precision, latency, cost, and failure rate as applicable.
- Preserve raw task-level receipts and independent grading provenance.
- Mock/deterministic results may validate contracts but cannot establish reasoning-quality or fusion-quality gains.
- No external provider calls, credentials, or paid inference are authorized by this plan.

Acceptance: reproducible baseline/candidate runs, distinct holdout set, leakage checks, blind independent grading, cost reconciliation, and a complete evidence packet. If no live/local-model execution is available, report quality as UNPROVEN rather than substituting mock scores.

## Workstream 4 — Vegito runtime verification

Status: IN PROGRESS; current runtime is one OpenAI executive core.

- Current kernel emits a Vegito contract but executes one injected executive core. Existing tests validate the contract envelope, not actual faculty patch execution.
- Add a structured shared-state schema and explicit faculty contribution receipts.
- Verify that contributions read and patch the same state revision, preserve provenance, and cannot silently overwrite conflicting decisions.
- Add deterministic tests for ordering, conflicts, missing receipts, malformed patches, unauthorized actions, and single final-answer ownership.
- Do not describe same-model faculty passes as independent models. No external provider participation without an approved and observed call receipt.

Acceptance: runtime traces show actual faculty contribution artifacts and a single final answer; adversarial tests validate conflict handling and provenance. Quality gain remains UNPROVEN until the benchmark's independent holdout gate passes.

## Workstream 5 — Self-Audit HQ interface

Status: NOT STARTED.

- Add a unified view for objectives, approvals, workstream status, evidence ledger, blockers, costs, test runs, regressions, and next actions.
- Display status distinctions without greenwashing: proposals are not executions; CI success is not live capability validation.
- Preserve approval history and require explicit approval for consequential changes.
- Keep JARVIS-X HQ separate from Sampa.co command center.

Acceptance: UI tests cover each evidence state, each execution state, blocked/unknown costs, approval transitions, stale evidence, and no accidental activation.

## Current verified checkpoint

- PR #75 CI run #1766 passed on exact candidate SHA `73810b5db6a83da23dac78c86e09c8af436aa0fc`: TypeScript build, Deno gateway type-check, unit tests, HQ browser E2E, syntax checks, and runtime benchmarks.
- This validates that candidate's CI checks only. It does not prove live multi-model fusion, improved reasoning quality, authenticated PRONOTE access, or production deployment.
- The current cognitive kernel reports `single-core-cognitive-kernel` and one OpenAI provider receipt.
- No merge, deployment, DB change, secrets, production configuration, permission change, paid inference, or wallet top-up has occurred.

## Promotion gate

BASELINE → IMPLEMENT → TEST → INDEPENDENT CHALLENGE → COMPARABLE/HOLDOUT RETEST → REGRESSION CHECK → KEEP / MODIFY / REJECT / UNPROVEN.

Do not merge or deploy this execution branch without a separate explicit approval.

## PRONOTE portal update — 2026-11-03

- User supplied: `https://e221000e.index-education.net/pronote/eleve.html`.
- OBSERVED public page metadata: title `PRONOTE - Le Collège Bilingue`; description identifies `PRONOTE Espace Élèves - Le Collège Bilingue - Dakar (DK)`; version shown: `PRONOTE 2026.2.8`.
- A manual setup handoff was started for existing profile `prof_94e89a9aa6d14585` (PRONOTE Fresh Login). The user must open the setup link provided in chat, sign in directly there, and select **Save profile**. Credentials must not be sent in chat.
- Profile setup is not yet complete. Do not mark the profile authenticated until the user completes the setup flow and the profile reports the site as signed in.
- TinyFish wallet remains observed at -$0.792. No metered automation, top-up, or paid access was initiated.
