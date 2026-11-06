# JARVIS-X Agent Capability Runtime v1

## Added
- Declarative agent registry: role, evidence status, activation, independence group, tool allowlist and data scope.
- Runtime validates the registry and dispatches only to host-injected handlers after explicit authorization.
- In-memory execution audit records authorization denials, execution outcomes and verifier failures. Tests cover duplicate identities, unknown tools, unassigned independence, disabled agents, authorization denial, successful dispatch and failed verification.
- Runtime has bounded concurrency (1–8), bounded timeouts (100–120000 ms), caller cancellation propagation and cooperative handler abort signals. A timed-out handler retains its concurrency lease until it actually settles; a handler that ignores cancellation can therefore hold a slot, which is fail-closed rather than silently allowing concurrency overcommit.
- The default verifier denies validation. Only an independently injected verifier returning literal `true` can produce VALIDATED; a handler's own `{ verified: true }` claim is ignored.

## Truth and safety boundaries
- Registry entries begin DISABLED and PROPOSED. They are candidates, not discovered connected agents.
- A second prompt or wrapper around the same model is not independent. Independence requires separate, evidenced operators/providers/execution paths.
- No shell, filesystem, ambient network, credential, database, merge or deployment handler is built in. A trusted host must inject narrowly scoped handlers.
- Runtime defaults to deny authorization. No handler executes without positive authorization.
- Handler output is OBSERVED, not necessarily correct. Failed verification remains UNPROVEN.
- In-memory audit is neither durable nor tamper-resistant.
- Registry presence, installed tools and available external apps do not mean connected, authenticated or invoked.

## Production integration gate
Bind authenticated identity, approval receipts, replay protection, durable audit, timeout/cancellation, per-tool policy, tenant isolation and rate/cost controls before enabling agents. This PR does not change production configuration or activate agents.
