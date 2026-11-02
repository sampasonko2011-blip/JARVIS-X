# JARVIS-X Capability Fusion Blueprint

**Architecture decision:** one JARVIS-X executive identity; capabilities are composed behind it. Provider count is not the architecture.

## Executive identity

The Cognitive Kernel owns the objective, task decomposition, capability selection, policy checks, evidence interpretation, challenge pass, synthesis, and final user-facing answer.

Lead, challenge, and synthesis are passes of the same JARVIS-X identity. They are not separate assistants, independent model votes, or proof of independent verification. Independent verification comes from deterministic checks, source inspection, test execution, or genuinely separate evidence sources.

## Capability families to compose

| Capability | Public pattern observed | JARVIS-X target | Current boundary |
|---|---|---|---|
| Research | Search, URL/page retrieval, citations, freshness | Search/fetch adapter with source receipts, dates, bounded excerpts | No external research adapter is registered in the HQ gateway |
| Analysis and code | Sandboxed code execution, structured function calls | Deterministic, resource-bounded analysis tools | Only local `text.analyze` is currently defined in the gateway |
| Knowledge and memory | Persistent context, document retrieval, explicit context boundaries | XMemo operational state; Supermemory stable semantic recall; consent and account scoping | Live HQ XMemo recall/write, deletion, and account isolation remain unverified |
| Browser interaction | Screen observation followed by controlled actions | Allowlisted browser adapter with bounded actions, receipts, approval for writes | No browser/computer adapter is registered in the HQ gateway |
| Connectors | MCP as a common tool interface; scoped access | Provider-neutral connector interface, capability manifest, per-user scopes, server-side credentials | Generic tool-broker boundary exists; no connector executor is wired into HQ |
| Long-running work | Persistent task state and resumable handoffs | One resumable task graph with dependencies, checkpoints, cancellation, bounded retry | Local workflow queue exists; durable cross-device task execution is not validated |
| Verification | Structured outputs and constrained schemas | Evidence ledger linking claims to receipts; output validation separate from world-state verification | Audit metadata exists; end-to-end external execution receipts are not validated |
| Multimodal creation | Image generation and multimodal tools as capabilities | Explicit adapter with safety and permission checks | HQ image generation is not connected |

## Public documentation patterns reviewed

- Google Gemini documents built-in tools including Search, Maps, code execution, URL context, file search, computer use, and custom function calling; tool-combination guidance explains composing managed tools and application functions.
  - https://ai.google.dev/gemini-api/docs/tools
  - https://ai.google.dev/gemini-api/docs/tool-combination
- Mistral documents web search, code interpreter, document libraries, function calling, MCP connectors, and human-in-the-loop action approval.
  - https://docs.mistral.ai/studio/agents/agent-tools
  - https://docs.mistral.ai/studio/connectors
  - https://docs.mistral.ai/studio/agents/introduction
- xAI documents web/X search, code interpreter, and function calling. Some tools have explicit per-fetch charges and are not assumed to fit the €0 guard.
  - https://docs.x.ai/developers/tools/overview
  - https://docs.x.ai/developers/tools/x-search
  - https://docs.x.ai/developers/tools/function-calling
- DeepSeek documents Search/Fetch and function-calling patterns. Documentation availability does not imply account authorization or free usage.
  - https://api-docs.deepseek.com/guides/search/
  - https://api-docs.deepseek.com/guides/tool_calls/
- Anthropic's public Claude Code guidance describes subagents as a selective technique for parallelizable or isolated work, not a default requirement. JARVIS-X adopts minimum-sufficient decomposition without creating separate user-facing identities.
  - https://docs.anthropic.com/en/docs/claude-code/sub-agents
- OpenAI memory documentation describes saved memory and chat history as context features with user controls; JARVIS-X must still maintain its own source-of-truth and consent rules.
  - https://help.openai.com/en/articles/8590148-memory-faq

These references are design inputs, not instructions to integrate every vendor or call their APIs.

## Capability control plane

Every capability must declare: stable ID/version; purpose and strict input/output schema; data classification and retention; scopes and consequence level; cost class and zero-cost eligibility; timeout/concurrency/payload/retry limits; local/remote/device execution location; approval requirements; evidence receipt schema; and tests for denial, malformed input, timeout, unavailable service, duplicate request, and output verification.

The registry remains sealed after construction. The model may select only registered capabilities. Retrieved content and tool output are untrusted data, never new instructions or permission grants.

## €0 and privacy guard

- No paid model inference, paid search, or billable external API calls.
- No provider keys or privileged credentials in browser code, local storage, exported packets, or Git.
- Public documentation does not activate a capability.
- Prefer local deterministic tools and already-authorized, verified free capabilities.
- Unknown price, quota, authorization, or data handling means BLOCKED / UNPROVEN, not free.
- Keep production budget gates fail-closed. This blueprint does not authorize deployment or activation.

## Current implementation truth at PR #73 (before the UI cleanup)

- **OBSERVED:** PR #73 is open, draft, unmerged, and based on the single-core Cognitive Kernel branch.
- **OBSERVED:** gateway source contains a sealed schema-validated capability registry and bounded Responses function-call loop.
- **OBSERVED:** the only default gateway capability is deterministic read-only `text.analyze`; it is disabled unless the server-side feature flag is explicitly enabled.
- **OBSERVED:** gateway uses a testable XMemo transport adapter. Request consent is checked in the gateway and independently enforced inside the adapter; adapter tests cover zero calls when consent is off, UUID-scoped paths, common-pattern redaction, bounds, and failure handling. These are mocked contract tests, not proof of live persistence, account isolation, or deletion/retention semantics.
- **OBSERVED:** generic HQ tool broker requires injected executors, exact scopes, trusted approval verification, audit callbacks, and world-state verification; no connector executor is registered.
- **OBSERVED:** PR #73 is not deployed. Production cutover runbook says prepared, not executed.
- **BLOCKED:** paid inference remains blocked under the €0 requirement. No live provider, search, or connector smoke test is authorized here.
- **UNPROVEN:** cross-device HQ memory/task continuity, browser automation, external code execution, HQ image generation, and any measurable multi-AI benchmark standard.

## Delivery order

1. Keep one-identity UI and internal-pass vocabulary consistent.
2. Define and test a provider-neutral capability manifest and registry contract.
3. Add one trusted read-only adapter at a time, starting with the lowest-risk authorized no-cost source.
4. Validate consent-off zero reads/writes, consent-on round-trip, A/B account isolation, deletion, restart, and cross-device retrieval in a verified zero-cost test scope.
5. Add resumable task state only after durable storage and idempotency are verified.
6. Add browser/computer or consequential writes only with per-action approval, audit receipts, and independent world-state checks.
7. Run a fixed holdout benchmark against the baseline: task success, factuality, citation correctness, calibration, safety, latency, cost, and recovery. Keep, modify, reject, or leave unproven based on retest.

**Completion rule:** a capability is not complete when a schema or adapter exists. It is complete only when authorization, execution, output validation, and required world-state verification pass.
