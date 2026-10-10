# Level 6 provider-neutral milestone

## Target

JARVIS-X's core remains provider-neutral: model vendors and gateways are replaceable, while routing, capability composition, verification, and evidence remain owned by JARVIS-X.

## Evidence ledger

| Item | Status | Evidence / limit |
|---|---|---|
| Existing core separates Provider from orchestration | OBSERVED | `src/core/types.ts` defines `Provider`; `CapabilityRegistry` registers providers by ID. |
| Generic OpenAI-compatible adapter | VALIDATED (software) | Added to `src/providers/openai-compatible.ts`; deterministic CI tests exercise request shape and response handling. |
| Paid/trial/unknown route guard | VALIDATED (software) | Adapter rejects these cost classes by default; classification itself is an operator assertion. |
| Allowlisted zero-cost failover | VALIDATED (software) | `FallbackProvider` filters candidates by explicit zero-cost classification and has deterministic tests. |
| Public model-scouting policy | VALIDATED (documentation/policy) | `docs/model-scouting-and-composite-selection.md` distinguishes public workflow patterns, open weights, hosted APIs, and gateways. |
| Model shortlist | CANDIDATES, NOT RANKED | `evaluation/model-candidates.json` intentionally makes no unsupported performance claims. |
| FreeLLMpool live integration | UNPROVEN | No live upstream call or route-level price verification was performed by CI. |
| Local fallback | PARTIAL | The failover chain can include a loopback-compatible local runtime, but the runtime must be installed/configured and its availability verified by the operator. |
| Composite quality improvement | UNPROVEN | Requires fixed benchmark set, eligible live models, blind scoring, and comparable retest. |

## Completion gate

A green build proves software-level checks only. The provider milestone is not behaviorally validated until a harmless live request succeeds against a route whose recurring zero-cost status is verified, and a repeatable comparison demonstrates quality/latency trade-offs. Never claim that the adapter makes proprietary models' weights or intelligence transferable.
