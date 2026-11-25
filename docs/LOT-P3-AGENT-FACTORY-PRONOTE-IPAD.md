# Lot P3 — Agent Factory, AI Builder & PRONOTE iPad Bridge

Status: design baseline (not production-ready)
Branch: `feat/p3-agent-factory-pronote-ipad-bridge`
Base: `main` after PR #139 merge
Spend policy: zero paid services, no production deployment, no secrets in Git.

## Goals

1. Deliver a privacy-preserving, user-controlled PRONOTE ingestion path that can be tested on the user's iPad.
2. Introduce a bounded Agent Factory for task decomposition and short-lived specialist workers.
3. Introduce an AI Builder that proposes tools in an isolated sandbox; no tool is activated without explicit L3 approval.
4. Preserve one shared task state, evidence ledger, budget, and synthesized result.

## Non-goals and hard boundaries

- No PRONOTE password, QR payload, session cookie, token, or student record may be committed, logged, or pasted into chat.
- No claim of real PRONOTE authentication, background execution while locked, or successful iPad synchronization until demonstrated on the physical device.
- Do not automate Safari session extraction or depend on undocumented authentication bypasses.
- Calendar writes, external messages, purchases, deployments, and tool activation require explicit L3 approval.
- No paid API, hosted agent runtime, or production deployment in this lot.
- An iCalendar feed is timetable-only unless the actual provider payload proves otherwise; it must not be presented as complete homework/grade ingestion.

## Architecture A — PRONOTE iPad bridge

### Preferred ingestion order

1. Official PRONOTE/ENT export or supported integration, if available for the user's institution.
2. User-triggered Apple Shortcut that obtains an explicitly exported file or supported feed and POSTs a normalized snapshot over HTTPS.
3. A local JSON import fallback for homework/evaluation data when no supported automated source exists.
4. iCalendar fallback for timetable events only.

No undocumented endpoint or credential replay is assumed. Any institution-specific PRONOTE capability must be confirmed before implementation.

### Snapshot contract

Versioned envelope:

- `schema_version: "pronote.snapshot.v1"`
- `source: "pronote_export" | "ical" | "manual_json"`
- `captured_at` and `received_at` as ISO-8601 timestamps
- `source_status: "fresh" | "stale" | "auth_required" | "partial" | "error"`
- `items[]` with stable source IDs where available, type, title, due date, updated timestamp, and minimal non-sensitive metadata
- `dedupe_key` derived from stable source identity; never from student secrets
- `warnings[]` and `coverage[]` describing what the source does and does not contain

### Security and reliability

- HTTPS only; authenticate the bridge using a revocable, narrowly scoped device token stored in iOS Keychain/Shortcuts secure input, never in source control.
- Validate schema, size limits, timestamps, allowed item types, and idempotency server-side.
- Reject replayed/duplicate snapshots safely; preserve last-known-good data on failed sync.
- Expose `last_successful_sync`, `sync_status`, `data_freshness`, `source_coverage`, and `auth_state`.
- Redact payloads from logs. Store the minimum data required; define retention and deletion behavior.
- The Shortcut must report success only after receiving and validating a server acknowledgement.
- Locked-screen execution is a device acceptance test, not a capability inferred from configuration.

### iPad acceptance proofs

A real-device test is required for each proof:

1. **Locked-screen run:** scheduled or user-triggered Shortcut executes with the device locked under supported iPadOS behavior; record timestamp and acknowledgement. No assumption of Safari scraping.
2. **Real data arrival:** a deliberately selected test homework/evaluation appears in Workspace with source provenance and correct due date.
3. **Freshness/session state:** expired/revoked bridge authorization or stale source is surfaced clearly; last-known-good data is not silently overwritten.

Do not request the user's PRONOTE credentials in chat. The user performs sign-in only on official provider surfaces.

## Architecture B — Agent Factory

### Lifecycle

`Task → Plan → Spawn → Execute → Challenge → Synthesize → Dispose`

- **Mitose:** split a task into bounded, independently testable subtasks with explicit inputs/outputs.
- **Specialists:** School, Football, Code, Research; these are roles/configurations, not claims of separate external models.
- **Shared state:** one objective, plan, evidence ledger, budget ledger, and final synthesis.
- **SaboteurAgent:** adversarially checks assumptions, evidence provenance, contradictions, privacy, and failure modes. It cannot approve its own output.
- **Apoptose:** dispose of worker state after synthesis; retain only approved durable artifacts and lessons.

### Mandatory controls

- Maximum worker count, depth, wall-clock budget, token/cost budget, and tool-call budget are explicit configuration with safe defaults.
- Unknown budget values fail closed; zero is not inferred from missing configuration.
- Workers cannot expand their own permissions or spawn unbounded descendants.
- Tool access is allowlisted per task and read-only by default.
- External side effects require L3 approval by the user.
- Evidence labels: OBSERVED, VALIDATED, PROPOSED, UNPROVEN, REJECTED, SUPERSEDED.
- State labels distinguish AVAILABLE, CONNECTED, AUTHENTICATED, INVOKED, EXECUTED, COMPLETED, and WORLD-STATE VERIFIED.
- Failures and negative test results remain in the evidence ledger.

## Architecture C — AI Builder sandbox

- Builder emits a declarative tool proposal (name, purpose, input/output schema, permissions, risk, tests, provenance).
- Static validation rejects unsafe or undeclared capabilities.
- Generated code runs in an isolated, no-network, no-secret sandbox with CPU, memory, time, filesystem, and output limits.
- Tests and Saboteur review must pass before the proposal can be shown for L3 approval.
- Approval activates only the exact reviewed artifact/version; any change invalidates approval.
- No self-installation, production deployment, credential access, or permission escalation.

## Delivery sequence

1. Inspect the merged P2.3 contracts and test conventions.
2. Add pure schema validators and snapshot normalization tests.
3. Add a mock-only ingestion endpoint/client contract; no provider credentials.
4. Add freshness, idempotency, expiry, and redaction tests.
5. Add Agent Factory lifecycle and budget primitives with deterministic fake workers.
6. Add Saboteur checks and evidence-ledger integration.
7. Add AI Builder proposal schema and sandbox policy tests.
8. Add iPad Shortcut walkthrough and a real-device test sheet.
9. Run unit, integration, E2E, security, and regression suites; open a draft PR.
10. No merge or deployment without a separate explicit GO.

## Definition of done

- All deterministic tests pass and CI evidence is tied to the exact branch HEAD.
- No secrets or personal school records appear in repository history, fixtures, or logs.
- Mock tests are clearly distinguished from real-provider and real-device acceptance.
- Agent budgets, L3 approvals, sandbox isolation, and disposal are enforced by code, not documentation alone.
- The three iPad acceptance proofs are recorded separately; until then the bridge remains UNPROVEN.
