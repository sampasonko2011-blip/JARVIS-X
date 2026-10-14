# Self-audit: real model evaluation readiness

Date: 2026-10-14
Branch: `fix/self-audit-real-model-evaluation`
Baseline PR: #15, head `9a3cc74788bd6d354e8fe437af367f52b9ff39b0`

## Evidence ledger

- **Objective:** make JARVIS-X model evaluation more honest and prevent the user-rejected OpenRouter route from appearing active.
- **Constraints:** no secret exposure; no paid calls without an explicitly configured budget and route; no unsupported model-quality claims; no unapproved merge.
- **Capabilities used:** connected GitHub repository/file inspection and branch/commit operations.
- **Baseline observed:** PR #15's evaluator can call a local OpenAI-compatible endpoint (default localhost Ollama), but runs only one model ID for both the direct answer and synthesis pass. The CI runtime benchmark uses deterministic mocks and does not call models.
- **Baseline observed:** registry contains candidate names and proposed IDs, but candidate presence is not proof that endpoint/model exists, credentials work, or access is free.
- **Intervention:** removed `openrouter-multi-provider-gateway` from candidate registry, role layers, and evaluation-plan roles; documented that it must not be reintroduced without explicit approval.
- **Verification performed:** parsed the JSON in-tool and checked that the OpenRouter candidate string was absent from the serialized registry after update. Commit: `f5aed5ef05bb190af22cbd07aae077c91ed39dd4`.
- **Not yet verified:** CI/test results for this new branch, actual local model inference, actual hosted provider access, live latency/cost, blind grading, holdout generalization, and any quality advantage.
- **Decision:** OpenRouter exclusion is implemented on this branch; overall model-quality improvement remains **UNPROVEN**.

## Required next experiment

1. Run CI on the pull request and inspect logs/artifacts.
2. Execute at least two exact, available model checkpoints through an authorized route. Prefer local Ollama if the user's computer is connected and has enough memory; otherwise use a verified authorized endpoint with an explicit budget.
3. Freeze task set and prompts, add a separate holdout, capture exact model/checkpoint, endpoint, configuration, timestamps, output, token usage, latency, failures, and actual/estimated cost.
4. Blind-score correctness, instruction compliance, evidence quality, unsupported claims, and task completion. Re-run comparable tasks.
5. Promote a model/route only if measured evidence clears the gate; otherwise keep it **UNPROVEN**.

## Important distinction

The current `evaluate:orbit` script is a paired single-model-versus-same-model-synthesis probe, not a multi-model tournament. It can inspect the value of a second-pass prompt on one configured endpoint; it cannot establish which provider/model wins or prove a multi-model composite is better.

## Follow-up candidate audit (2026-10-14)

- Refreshed the candidate registry using first-party model-catalog documentation for Google Gemini and Anthropic Claude.
- Removed five stale or incorrectly labeled candidate entries from the candidate list and active routing plans; added current documented Gemini/Claude candidate IDs as **PROPOSED, not benchmark winners**.
- Verified the updated registry parses as JSON, contains 50 candidates, and does not contain the rejected OpenRouter gateway ID.
- Still **UNPROVEN**: whether the linked user account can call each API, whether quota is free, live outputs/latency/cost, and comparative model quality. Registry inclusion is not endpoint verification.
- The local-runtime route is still blocked operationally: Desktop Commander currently reports no connected devices. The next concrete route is to connect a computer and verify Ollama/model hardware fit, or configure a separately authorized first-party endpoint with budget controls.
