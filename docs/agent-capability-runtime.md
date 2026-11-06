# JARVIS-X Agent Capability Runtime v1

## Added
- Declarative agent registry: role, evidence status, activation, independence group, tool allowlist and data scope.
- Runtime validates the registry and dispatches only to host-injected handlers after explicit authorization.
- In-memory execution audit and tests for duplicate identities, unknown tools, unassigned independence, disabled agents, authorization denial, successful dispatch and failed verification.

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
