# JARVIS-X Specialist Agent Registry

The primary execution boundary is `evaluation/agent-runtime.mjs` with declarative candidates in `evaluation/agent-registry.json`. `evaluation/agent-registry.mjs` is a provider-neutral registration helper; it does not connect or activate agents.

## Six specialist profiles
- Research: public-source discovery and synthesis.
- Engineering: selected-repository review, patch proposals and sandbox tests.
- Security: privacy, threat-model and diff review.
- Evaluation: benchmark design, held-out tests and regression critique.
- Memory: memory-contract and provenance analysis.
- Operations: planning and workflow coordination.

All six profiles are DISABLED/PROPOSED and use the unassigned independence group. They are not live agents and do not count as independent providers.

## Controls
- The runtime validates unique IDs, evidence state, activation, independence declaration, tool allowlists and data scopes.
- Only an explicit allowlist of public/read-only/repository-diff/sandbox-test tool classes is supported.
- A host must inject trusted handlers and an authorization function. Authorization defaults to deny.
- A second prompt or wrapper around the same model is not independent.
- Handler output is OBSERVED unless an independent verifier confirms it. Failed verification remains UNPROVEN.
- No credentials, production write, merge, deployment, paid inference or background scheduling are enabled.

## Limitations
The current registry is declarative. It does not create six external models, establish independent operators, provide durable audit, or prove a shared-state multi-agent runtime. Exact approval authentication and durable replay protection remain host integration requirements.
