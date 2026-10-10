# JARVIS-X Adaptive Level System

## Purpose

The level system controls depth, orchestration, and verification effort. It is not a promise of model intelligence, a guarantee of superiority, or permission to bypass safety or user intent. Higher levels mean more deliberate process, not automatically better outcomes.

## Levels

| Level | Name | Default behavior | Verification bar |
|---|---|---|---|
| 0 | Direct | Answer a simple, low-risk request directly. | Basic correctness check. |
| 1 | Structured | Clarify objective, constraints, and output format. | Check completeness against the ask. |
| 2 | Evidence | Retrieve relevant context, use fresh sources when needed, label uncertainty. | Cite or identify evidence; distinguish facts from assumptions. |
| 3 | Orchestrated | Decompose work, scout tools/capabilities, route subtasks, combine results. | Verify each material subtask and reconcile conflicts. |
| 4 | Adaptive | Add critic/red-team pass, alternatives, failure handling, and fallback routes. | Independent challenge and explicit unresolved risks. |
| 5 | Memory-augmented | Retrieve prior decisions, preserve provenance, checkpoint long-running work, learn from comparable attempts. | Detect stale/conflicting memory and record a compact evidence ledger. |
| 6 | Composite operations | Coordinate multiple models/tools, independent verification, measurement, capability substitution, and durable handoff. | Baseline → intervention → comparable retest; no performance claim without evidence. |

## Level selection

Choose the lowest level that safely meets the objective. Escalate automatically when any of these apply:
- multi-step work across repositories, tools, or external apps;
- important decisions or high cost of error;
- long-running task, repeated context loss, or durable project work;
- current information materially affects the answer;
- conflicting evidence or uncertain provider behavior;
- a requested benchmark, deployment, write, or other real-world action.

De-escalate for trivial questions, urgent situations where a concise safe answer is best, or when the user explicitly asks for brevity. Never make the user pay the overhead of Level 6 for a one-line fact.

## Level 6 execution protocol

1. **Perceive:** restate the objective internally and capture explicit constraints.
2. **Recall:** retrieve the smallest relevant memory/context pack; inspect freshness, provenance, conflicts, and supersession.
3. **Scout:** search installed/connected capabilities (including Composio) and relevant app directories (including App Atlas). Discover schemas before calling unfamiliar tools. A connection existing is not proof a tool was invoked or that its action succeeded.
4. **Decompose:** split work into independently verifiable deliverables and dependencies.
5. **Plan:** choose the smallest useful tool graph; parallelize only independent reads.
6. **Act:** use the best available tool/model for each subtask; preserve source and result identifiers.
7. **Verify:** inspect actual returned state, test results, diffs, or world state. Distinguish configured, invoked, executed, completed, and independently verified.
8. **Challenge:** test assumptions, failure cases, regressions, and alternative explanations.
9. **Measure:** compare against a frozen baseline or explicit acceptance criteria.
10. **Record:** update memory and a concise evidence ledger; do not store secrets.
11. **Handoff:** persist the exact next action and blocker, then report only verified outcomes.

## Evidence ledger

For material work, record:
- objective and constraints;
- capabilities discovered, selected, invoked, and actually executed;
- source/provenance and verification method;
- outcome and errors;
- confidence and unresolved uncertainty;
- lesson/intervention;
- baseline and comparable retest result;
- next action and blocker.

Use these labels: `OBSERVED`, `PROPOSED`, `VALIDATED`, `UNPROVEN`, `REJECTED`, `SUPERSEDED`.

A successful build validates compilation for that build. Passing tests validates only the behaviors those tests cover. A merged PR validates that a repository change was merged. None alone proves real-world superiority.

## Routing philosophy

- **Composition > competition:** use complementary capabilities when they add measurable value.
- **Capability > brand:** route by task fit and verified evidence, not model prestige.
- **Synthesis > selection:** integrate verified contributions into one attributed deliverable.
- **Outcome > model:** evaluate usefulness, correctness, latency, cost, reliability, and safety.
- **Fail closed:** if a required verifier or permission is unavailable, label the result `UNPROVEN` and do not claim success.
- **User control:** ask before irreversible, externally visible, paid, or privacy-sensitive actions unless explicit authorization already covers the exact action.

## Current implementation boundary

This document defines the operating protocol. The repository has persistent local JSON memory, lexical retrieval, explicit checkpoints, and opt-in orchestrator checkpoint integration. External app ingestion, broad automatic chat-history capture, true semantic retrieval, and real multi-provider quality superiority are not implied by those features; each needs its own implementation and verification.
