# Level 6 provider-neutral milestone

## Target

JARVIS-X's core remains provider-neutral: model vendors and gateways are replaceable, while routing, capability composition, verification, and evidence remain owned by JARVIS-X.

## Evidence ledger

| Item | Status | Evidence / limit |
|---|---|---|
| Existing core separates Provider from orchestration | OBSERVED | `src/core/types.ts` defines `Provider`; `CapabilityRegistry` registers providers by ID. |
| Generic OpenAI-compatible adapter added | PROPOSED until CI | `src/providers/openai-compatible.ts` supports configurable endpoint/model, timeout, output bound, and explicit cost class. |
| Paid/trial/unknown route guard | PROPOSED until CI | Unit tests assert default fail-closed behavior. |
| FreeLLMpool live integration | UNPROVEN | No live upstream call or route-level price verification was performed by CI. |
| Local fallback | PARTIAL | Adapter can point at a loopback-compatible local runtime; automatic health-aware fallback policy is not implemented by this adapter. |
| Composite quality improvement | UNPROVEN | Requires fixed benchmark set, eligible live models, blind scoring, and comparable retest. |

## Completion gate

A green build proves software-level checks only. The provider milestone is not behaviorally validated until a harmless live request succeeds against a route whose recurring zero-cost status is verified, and a repeatable comparison demonstrates quality/latency trade-offs. Never claim that the adapter makes proprietary models' weights or intelligence transferable.
