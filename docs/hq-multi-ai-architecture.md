# JARVIS-X HQ — secure multi-AI architecture and release gates

**Status: PROPOSED.** This document defines the next implementation boundary. It is not evidence that authentication, synchronization, model calls, or orchestration currently work.

## Product boundary

The HQ browser app is an untrusted client. It may display records and collect a user-approved task, but it must never hold provider API keys, service-role credentials, or unrestricted tool permissions. Static GitHub Pages can host the UI only; it cannot provide secret-safe provider execution or durable cross-device state by itself.

## Target architecture

```text
Browser / PWA
  ├── local draft cache (non-authoritative; exportable)
  ├── authenticated HTTPS requests
  └── explicit consent + task scope
          |
          v
API gateway / application backend
  ├── authentication + session validation
  ├── tenant/user authorization on every object
  ├── schema validation + size/rate limits
  ├── policy engine (tools, data classes, approval gates)
  ├── orchestration state machine
  ├── provider adapters (server-side secrets only)
  ├── tool broker (allowlisted capabilities, least privilege)
  ├── evidence ledger (source, time, status, outcome)
  └── durable database + backup/deletion lifecycle
          |
          +--> Model provider A (authorized key/account)
          +--> Model provider B (authorized key/account)
          +--> Model provider C (authorized key/account)
          +--> Approved tools / connectors
```

Providers are interchangeable capability adapters, not identities that share hidden weights, internal memory, or credentials. A model is usable only after its provider is explicitly configured and its access is tested. OpenRouter remains excluded unless the owner explicitly reauthorizes it.

## Provider adapter contract

Every adapter should implement the same narrow contract:

- `capabilities()`: provider/model identifiers, supported modalities, context limits when documented, tool-call support, and known constraints.
- `healthcheck()`: make a minimal authorized request and record timestamp, provider response, latency, and failure category. No successful config check may be labeled a successful behavioral evaluation.
- `generate(task, policy, abortSignal)`: accept a validated task envelope; apply timeout and output-size bounds; return normalized text/structured output plus provider/model, usage/cost metadata when available, and errors.
- `close()`: release local resources where relevant.

The adapter must not accept arbitrary endpoint URLs, shell commands, or user-supplied secret references. Credentials are resolved server-side from a secret manager/environment, never sent back to the browser or written to logs.

## Orchestration state machine

1. **INTAKE** — validate user intent, attachments, task size and allowed data class.
2. **PLAN** — choose the smallest set of providers/tools that can meet the task.
3. **AUTHORIZE** — check user permissions and task-specific consent; request confirmation for consequential external actions.
4. **EXECUTE** — parallelize only independent work; enforce timeouts, cancellation, quotas and concurrency caps.
5. **SYNTHESIZE** — separate source-backed facts, model proposals, conflicts and unknowns.
6. **VERIFY** — validate schema, citations/evidence, calculations and action outcomes independently where feasible.
7. **CHALLENGE** — use a critic pass for high-impact or uncertain claims; do not equate agreement among models with truth.
8. **COMMIT** — persist only authorized records/actions; record outcome and source metadata.
9. **REPORT** — disclose what was proposed, invoked, executed, verified, failed or left unknown.

Required labels: **OBSERVED / VALIDATED / PROPOSED / UNPROVEN / REJECTED / SUPERSEDED**. Keep **AVAILABLE ≠ INVOKED ≠ EXECUTED ≠ CORRECT ≠ COMPLETED ≠ WORLD-STATE VERIFIED**.

## Minimum security controls

- Managed authentication with short-lived sessions and secure cookie/session settings; no DIY password storage.
- Server-side authorization on every record and tool action; deny by default.
- Database row/tenant isolation and automated cross-user isolation tests.
- HTTPS only; secrets in a managed secret store; redact tokens and sensitive payloads from logs.
- Strict request/response schemas, body-size limits, per-user and per-provider rate limits, timeouts and cost ceilings.
- Tool allowlist with least-privilege scopes; read-only default; explicit approval for writes, messages, deployments, purchases, account changes and destructive actions.
- Prompt-injection boundary: provider output and retrieved documents are untrusted data, never authority to expand permissions or bypass policy.
- Data minimization, retention/deletion rules, export, backup recovery and audit trail.
- CSP and other browser security headers configured as HTTP response headers in production. The current HTML meta policy is only a baseline and still permits inline script/style.
- Dependency and workflow permissions reviewed; deployment limited to protected main and reviewed commits.

## Memory model

Separate memory into:
- **Session state:** short-lived task context, expiring automatically.
- **User memory:** explicitly user-visible, editable, exportable and deletable records.
- **Project memory:** shared project facts with source and freshness metadata.
- **Evidence ledger:** immutable-style event history for actions and verification, subject to an explicit retention policy.

Each record needs owner/tenant ID, stable ID, schema version, created/updated timestamps, source, sensitivity classification and retention policy. Synchronization must use conflict-aware versioning and server-side authorization. Do not sync secrets or silently promote model-generated guesses into durable facts.

## Failure and adversarial tests

Before enabling real provider execution, tests must demonstrate:

- user A cannot read/write user B's memory by guessing IDs;
- expired/revoked sessions and missing authorization are denied;
- malicious retrieved text cannot make the tool broker exceed the approved allowlist;
- provider timeout, malformed output, rate limit, and partial failure are visible and bounded;
- cancellation stops pending work and prevents late results from being committed;
- budget/concurrency limits hold under retry and parallel execution;
- secret values never appear in browser assets, client responses, logs, exported records or error messages;
- backup restore and deletion are verifiable;
- duplicate/replayed action requests do not repeat non-idempotent side effects;
- evidence is retained for both successful and failed actions without claiming unobserved external outcomes.

## Release gates

### Gate A — static prototype
- CI green on latest revision.
- Mobile, keyboard, persistence, import/export and service-worker tests pass.
- No production credentials or claims of remote persistence.

### Gate B — public static preview
- Owner configures GitHub Pages to use GitHub Actions.
- Reviewed changes are merged by the owner/authorized maintainer.
- Deployment workflow succeeds and emits a URL.
- Open that exact URL and verify HTTPS, asset loading, navigation, install prompt where supported, and offline shell behavior on desktop and a physical mobile device.
- Confirm no secrets or private data are embedded in published assets.

### Gate C — authenticated backend
- Separate backend service and managed database exist.
- Auth, tenant isolation, session expiry, backups/deletion, rate limits, logging redaction and threat-model tests pass.
- Backend is deployed to an explicitly selected and authorized host.

### Gate D — first live model adapter
- One explicitly authorized provider is configured server-side.
- Smoke test verifies real response, timeout, quota handling, secret redaction and audit record.
- No autonomous external writes; user approval is required.

### Gate E — multi-provider orchestration
- At least two providers are individually validated on comparable tasks.
- Routing, disagreement handling, cost/latency measurement, cancellation, fallback and evaluation baselines are tested.
- Additional providers are added only when they improve outcomes or provide a needed capability.

## Decisions still requiring owner input

Implementation of the backend cannot responsibly guess:
- which hosting account/service is authorized for the API and database;
- which provider accounts/keys are available and permitted;
- whether memory sync is opt-in and which data classes may leave the device;
- retention/deletion policy and allowed tool scopes.

Do not paste API keys into chat, browser JavaScript or Git. Configure secrets through the selected provider's secure secret manager after the hosting choice is approved.
