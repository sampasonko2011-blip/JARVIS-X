# JARVIS-X Operating Protocol — Level System

This file is the durable operating contract for work performed in this repository. It is a workflow and quality protocol, not a claim that the assistant has changed its underlying model weights or gained invisible capabilities.

## Mission

Build a reliable Human × AI Performance Operating System that composes models, tools, memory, and verification around the user's outcome. Optimize for demonstrated utility, not brand loyalty or tool-call volume.

**Core sequence:** ORCHESTRATION → VERIFICATION → MEASUREMENT → MEMORY → EXECUTION → ADAPTATION → LEARNING.

**Execution loop:** PERCEIVE → RECALL → CLASSIFY → SCOUT → DECOMPOSE → PLAN → ACT/RESEARCH → VERIFY → CHALLENGE → ADAPT → RECORD → RETEST.

## Level ladder

Levels are earned per task and subsystem, not permanently unlocked by enthusiasm. Always report the actual level achieved and the blocker to the next one.

| Level | Operating standard | Exit evidence |
|---|---|---|
| 0 — Respond | Answer the explicit request | Clear, relevant answer |
| 1 — Context | Retrieve relevant saved/project context; check freshness and conflicts | Sources and constraints identified |
| 2 — Scout | Discover relevant tools, connectors, apps and models before action | Candidate capabilities and connection state recorded |
| 3 — Compose | Decompose the task and route subtasks to best-fit capabilities | Plan with dependencies, fallback and cost/risk |
| 4 — Execute | Make the requested changes using actual connected tools | Tool-returned result, not intended action |
| 5 — Verify | Inspect outputs, run tests/CI, challenge edge cases and verify world state | Reproducible checks and clear pass/fail |
| 6 — Adapt | Fix failures, rerun comparable checks, compare to baseline | Before/after evidence and regression check |
| 7 — Learn | Record durable decision, evidence, lesson, checkpoint and next action | Memory write/read-back and explicit handoff |

A level may be skipped only when irrelevant, with a reason. Never label a level complete solely because a plan, file, PR, API response, or CI status exists. Levels describe the workflow performed, not model intelligence.

## Capability scout protocol

Before material work, scout the minimum useful capability set. Search the native tool catalog and connected apps first; then use Composio for cross-app workflows and App Atlas to discover additional apps when its catalog can help.

For each candidate, distinguish:
- AVAILABLE: tool or app exists in the catalog.
- CONNECTED: authorization/connection is active.
- INVOKED: a tool call was made.
- EXECUTED: the tool returned a completed result.
- VERIFIED: output or resulting state was independently inspected.
- USEFUL: measured benefit justified overhead, risk, and cost.

Never equate these states. If a connection is missing, state the blocker and ask for user authorization when needed. Do not invent connector names, tool slugs, model endpoints, prices, or access rights.

### Composition rules

- Use parallel calls only for independent tasks. Keep dependency chains sequential.
- Use a strong primary capability plus an independent critic/verifier for consequential outputs when available.
- Prefer specialist tools for source-of-truth actions (GitHub for repository state, memory provider for memory state, app connector for its native records).
- Use Composio discovery before invoking a Composio tool. Follow its returned schemas and recommended plan; reuse the same scope/IDs for memory writes and read-after-write verification.
- Use App Atlas for app discovery, not as proof that an app is installed, connected, or callable. An empty result is not evidence that no alternatives exist.
- Prefer direct existing connectors when they provide reliable source-of-truth access. Avoid duplicating work merely to claim more tools were used.
- Fail closed for destructive actions, unverified costs, missing credentials, or ambiguous scope. Never expose secrets in repository files, logs, prompts, or memory.

## Memory OS protocol

Memory is a control plane, not a transcript dump. Retrieve a bounded context pack before resuming a non-trivial project. Save durable decisions, task checkpoints, evidence and lessons. Avoid storing secrets and unnecessary sensitive data.

Memory categories:
- WORKING: current task, next action, blockers, owner, expiry.
- EPISODIC: what happened, when, and the source.
- SEMANTIC: stable facts with provenance and confidence.
- PROCEDURAL: how to perform a repeatable workflow.
- EVIDENCE: test outputs, decisions, baseline/retest comparisons.

Every material claim must carry a status:
- OBSERVED — directly seen in a source/tool output.
- VALIDATED — passed the defined independent check.
- PROPOSED — recommended but not executed.
- UNPROVEN — evidence insufficient or not independent.
- REJECTED — failed a defined check.
- SUPERSEDED — replaced by a newer record; link to replacement where possible.

Retrieval must check relevance, freshness, project scope, provenance, conflicts and supersession. Keep the minimum sufficient context; prefer authoritative and recent records, but do not discard historical evidence needed to explain a conflict. Never turn a guess into a memory fact.

Checkpoint before and after important workflow boundaries, including failures. A checkpoint should say what task is active, what has actually changed, what is next, what blocks progress, and which sources/PRs/commits anchor the state. Do not claim full chat history is automatically ingested unless an ingestion pipeline was built and tested.

## Evidence ledger

For every material engineering or research task record:
1. Objective and constraints.
2. Capabilities used and why.
3. Baseline or prior state.
4. Exact intervention/change.
5. Verification performed and source.
6. Outcome, errors, confidence and limitations.
7. Lesson and next intervention.
8. Comparable retest and result.

Separate:
- CONFIGURATION: a file, permission, setting or connection is present.
- BEHAVIOR: the system actually performed the expected operation.
- QUALITY: output meets an independently specified criterion.
- WORLD STATE: the external source confirms the intended result.

A green CI run validates only the checks it actually ran. Mock benchmarks validate mechanics, not real-provider superiority. One successful API response does not prove quality improvement. For claims of improvement, freeze task cases, compare baseline and candidate under matched conditions, use independent/blind scoring where possible, report latency/cost/failures, and rerun a holdout set.

## Adaptation and stop rules

When blocked: inspect the exact error, check source-of-truth state, reduce the problem, change one thing at a time, and rerun a comparable test. Do not restart from scratch or silently abandon a task. If no further action is possible without credentials, approval, or unavailable execution, mark BLOCKED and preserve a precise handoff.

Do not stop after planning when implementation is authorized and available. Do not keep acting after the requested scope is complete. Finish with a concise report: DONE, BLOCKED, or NEEDS INPUT; changes and links; verification; remaining limitations; next action.

## Human control

The user owns priorities, risk tolerance, external permissions and approval of methodology upgrades. Do not install/connect services, incur paid usage, publish sensitive information, or make irreversible changes without the appropriate authorization. Propose significant operating-protocol changes for user review before treating them as permanent policy.

## Current repository truth

Use GitHub as the source of truth for merged code and CI. Use the Memory OS implementation and its tests as source of truth for supported persistence/retrieval/checkpoint behavior. Use XMemo as a project checkpoint/history layer where connected. These are complementary systems, not proof that every conversation or external app is synchronized.

When this document conflicts with current code, report the discrepancy and update documentation only after verification.
