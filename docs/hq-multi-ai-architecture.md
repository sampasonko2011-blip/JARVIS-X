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


## Cross-platform memory API contract (proposed, not deployed)

The target is one account-scoped memory graph accessible from the HQ PWA and any separately authorized connector client. The HQ UI is never the source of authorization truth.

### Resource boundaries

- `GET /v1/me` — return the authenticated account's stable subject and permitted capabilities.
- `GET /v1/memories?cursor=…` — return only the current subject's authorized memory records, with pagination and sync cursor.
- `PUT /v1/memories/{id}` — create/update one memory using an idempotency key and expected revision (optimistic concurrency).
- `DELETE /v1/memories/{id}` — tombstone a record so deletion propagates to authorized devices and backup lifecycle.
- `GET /v1/sync?cursor=…` — return versioned changes/tombstones since a cursor; cursor is bound to the current user.
- `POST /v1/exports` and `POST /v1/deletions` — explicit export/delete workflows with status tracking.
- `POST /v1/ai/responses` — optional provider-gateway request; validates data scope, model allowlist, budget, output format, and consent before dispatch.

Every route must require a valid session, apply per-object authorization, validate schemas and body sizes, rate-limit, and emit a redacted audit event. Missing/expired auth fails closed. A connector can access only scopes the user explicitly grants; a ChatGPT connector or browser session is not automatically inherited by the static HQ.

### Memory record shape

```json
{
  "id": "stable-random-id",
  "schema_version": 1,
  "owner_id": "server-derived-subject",
  "kind": "user|project|evidence",
  "title": "User-visible title",
  "content": "User-approved context",
  "source": {"type": "user|tool|model", "ref": "optional-source-reference"},
  "status": "OBSERVED|VALIDATED|PROPOSED|UNPROVEN|REJECTED|SUPERSEDED",
  "sensitivity": "normal|sensitive",
  "revision": 1,
  "created_at": "server timestamp",
  "updated_at": "server timestamp",
  "deleted_at": null
}
```

`owner_id` is assigned by the server, never trusted from request JSON. Model/tool-sourced content remains proposed until a user or independent validation gate promotes it. Sensitive memory should be excluded from provider calls unless the user explicitly consents to that specific transfer.

### Sync and merge behavior

- Local changes enter an outbox with stable operation IDs; retry is idempotent.
- Each record has a monotonic server revision or ETag. A stale write returns a conflict rather than silently overwriting newer data.
- Text conflicts preserve both versions for review; never auto-merge evidence-status transitions or deletion/resurrection.
- Tombstones propagate deletion; restores require an explicit recovery flow and audit event.
- Offline records remain marked local/un-synced until the server acknowledges them. UI must never label a queued write as synchronized.
- Connectors retrieve data only through the same authorization boundary and never gain broad database access.


## Direct chat transport contract (implementation gate)

The HQ chat client checks same-origin `GET /api/v1/health` before enabling send. It requires an affirmative `status=ok`, `chat_enabled=true`, and `authenticated=true`. `POST /api/v1/chat` accepts a bounded message and conversation identifier, then must return a non-empty `reply`. The browser never receives provider credentials. The gateway must authenticate every request, enforce per-account rate and spend limits, validate input/output, redact logs, and call only a server-configured provider/model allowlist. It must not claim to be the user's existing ChatGPT session; API model access is a separate service and account boundary.

The static Pages origin currently has no `/api/v1/health` or `/api/v1/chat` implementation. The UI therefore stays disabled until a separately deployed gateway is verified. Production enablement requires an explicit hosting choice, server-side secret configuration, authentication/session design, CORS/origin policy if applicable, and end-to-end tests against the deployed service.


## Image-generation and multimodal capability boundary

The Image Studio is a prompt composer and manual handoff only until a real provider adapter is deployed. It must not infer image-generation capability from a text model's name, from a plugin being listed, or from a successful health check. A future image adapter must report: provider and exact model/version; supported image inputs/outputs; output dimensions and format; job identifier; returned artifact reference; usage/cost metadata where available; latency; errors; and deletion/retention policy. The UI may display **GENERATED** only after it receives and validates a real artifact reference from the authenticated server. User-uploaded source images and generated outputs need explicit consent and separate retention controls.

## Plugin and capability broker contract

A plugin registry entry is descriptive metadata, not an enabled connection. Each capability needs a stable ID, provider/version, declared input/output schema, data classification, required scopes, external side effects, timeout, rate/spend limits, health state, and revocation status. Keep these states separate: **DISCOVERED → PROPOSED → USER-APPROVED → CONNECTED → HEALTH-CHECKED → BEHAVIOR-VALIDATED**. Any state can become **REVOKED**, and a health check must not skip behavior validation. Tools receive task-scoped, short-lived authorization and only the minimum required data. No arbitrary endpoint URLs, shell access, credential echoing, or silent permission escalation. Consequential actions require a fresh confirmation immediately before execution.

## Multi-AI synthesis: the evidence-weighted panel

The default innovation is not to ask every model every question. Use a cost-aware, capability-first panel:
1. **Router** — classify the task and choose only providers that can contribute a distinct capability; exclude unauthorized/unavailable models.
2. **Independent drafts** — ask selected models to answer without seeing each other's conclusions when independence matters.
3. **Evidence extraction** — normalize claims into claim/source/date/confidence/unknowns and separate factual claims from recommendations.
4. **Adversarial challenge** — a separate critic searches for counterexamples, missing constraints, citation mismatch, and overclaiming.
5. **Deterministic verification** — recompute calculations, validate schemas, run tests, and check source links where possible; model consensus alone is not proof.
6. **Synthesis** — preserve disagreement and uncertainty; prefer a smaller verified answer over a larger unsupported consensus.
7. **Outcome feedback** — record acceptance, correction, latency, cost, failure type, and task result; only alter routing policy after comparable evaluation and human review.

The panel must never claim models share private memory, credentials, hidden reasoning, or weights. Context transfer is explicit and data-minimized. Each provider's answer is labelled with provider/model/version and execution state. If no model is connected, the task stays a local draft; it must not manufacture a response.

## Release gates for real integrations

- Authentication and per-user authorization on every request; CSRF/origin protection where applicable.
- Server-side provider credentials only; secret rotation and redacted logs.
- Input/output validation, size caps, timeouts, cancellation, concurrency limits, per-user quotas and spend caps.
- Provider failure, malformed response, timeout, revoked token, unavailable image output, and cross-user access negative tests.
- Data retention/deletion, export, backup restore, and cross-device consistency tests before memory sync is labelled durable.
- End-to-end tests against the deployed gateway, not only mocked browser routes.
- Independent challenge of the test evidence and a tested rollback path before promotion.
