# JARVIS-X HQ — capability activation plan

**Snapshot:** 2026-10-23. This plan intentionally defers Security Gateway/backend work until the other capability tracks are designed and locally testable. It does not claim any external provider is connected.

## Ordered workstream

1. **Multi-AI live orchestration**
   - Preserve the existing prompt council and manual handoff.
   - Define provider eligibility, lead/independent critic/synthesizer roles, provenance, and fail-closed fallback.
   - Only a provider with explicit authorization, a live test, and independently verified state may be treated as eligible. Planning eligibility is not invocation.
   - Later backend phase: add one authorized provider adapter at a time; capture redacted request IDs, provider/model, latency, errors, and usage/cost where available. Never put provider secrets in browser code.

2. **Real image generation**
   - Keep Image Studio prompt preparation working as-is.
   - Define an adapter contract for request validation, explicit user intent, provider/model provenance, returned asset metadata, and failure handling.
   - Actual generation requires an authorized image provider and a server-side adapter. Until that exists, report NOT_CONNECTED.

3. **Executable plugin/tool broker**
   - Build the policy core first: enabled-tool check, explicit scopes, risk classification, approval for material writes, execution receipt, and independent output/world-state verification.
   - Never confuse an integration catalogue entry or a policy pass with an executed action.
   - Later backend phase: implement least-privilege connectors, idempotency, cancellation, revocation, audit records, and per-action confirmations.

4. **Cross-device sync**
   - Define and test versioned sync-envelope schema, account ownership requirements, revision handling, and explicit limits.
   - Schema validation is not authentication, encryption, tenant isolation, conflict resolution, or durable persistence.
   - Later backend phase: use managed identity, per-user authorization, encrypted transport/storage, conflict detection, retention/deletion, export, and restore tests.

5. **Security Gateway and authenticated backend — LAST**
   - Keep the Security Gateway UI in PR #39 unchanged while the earlier tracks are prepared.
   - Do not merge or redesign it as part of the earlier capability tracks.
   - Only after the previous tracks have reviewed contracts and tests should the gateway/backend be revisited for authentication, secret storage, provider execution, rate/spend controls, tenant isolation, and production hardening.

## Current local implementation in this branch

- `hq/capability-core.mjs`: provider-neutral lifecycle, council eligibility planner, tool request policy, execution-receipt validation, and sync-envelope validation.
- `tests/hq-capability-core.test.mjs`: tests for lifecycle transitions, honest manual fallback, independent council eligibility, fail-closed tool policy, receipt validation, and sync schema limits.
- No network calls, credentials, provider adapters, image generation, remote writes, or external tool execution are included in this local core.

## Evidence gates

- **OBSERVED:** file/branch state and test results actually retrieved.
- **VALIDATED:** automated tests passed on the exact commit, with the result independently inspected.
- **PROPOSED:** design awaiting implementation or authorization.
- **UNPROVEN:** behavior has not been tested end-to-end.
- **REJECTED / SUPERSEDED:** retain the reason and retest evidence; do not silently erase failures.

For every capability, record: objective and constraints; source/commit; authorization and scope; invoked operation; raw result/error; output validation; independent world-state check; limitations; and comparable retest.

## Explicit non-goals of this phase

- No provider accounts, API keys, hosting, paid services, or connectors are added.
- No changes to the default branch or existing PR #39.
- No claim of live multi-AI orchestration, generated images, executable tools, authenticated sync, or deployed gateway.
