# JARVIS-X Memory OS

## Purpose

Memory exists to improve future decisions, not to accumulate an unsearchable transcript. Keep durable facts, project state, decisions, evidence, and lessons distinct so retrieval can return the smallest useful context with provenance.

## Memory layers

1. **Working state** — current task, next action, blocker, expiry. Refresh it at handoffs.
2. **Episodic history** — significant events, interventions, failures, and comparable retests.
3. **Semantic memory** — stable facts, preferences, definitions, and verified project knowledge.
4. **Procedural memory** — reusable protocols, checklists, and workflows.
5. **Evidence ledger** — claims and results with explicit status: OBSERVED, PROPOSED, VALIDATED, REJECTED, UNPROVEN, or SUPERSEDED.
6. **External source pointers** — repository paths, commit SHAs, document references, and timestamps. Preserve source/provenance rather than copying unsupported conclusions.

## Retrieval protocol

For a request that depends on prior work:

1. Resolve the current project and user goal.
2. Retrieve relevant durable facts, latest state, and recent events.
3. Check freshness, conflicts, source provenance, and whether the claim is observed or inferred.
4. Prefer the newest verified decision while retaining superseded decisions as history.
5. Return a minimum-sufficient context bundle: objective, constraints, current state, relevant decisions, evidence, next action, and blockers.
6. If retrieval is incomplete, state the gap rather than inventing continuity.

## Write protocol

Persist only information with future value. Record explicit user requests to remember, durable preferences, project decisions, significant milestones, measured outcomes, and lessons that change future behavior. Do not save transient chatter, credentials, API keys, access tokens, or unnecessary sensitive personal information.

For material work, record:
- Objective and constraints
- Baseline
- Capabilities available / invoked / executed
- Verification method and result
- Outcome, errors, confidence, and source
- Intervention and comparable retest
- Lesson and next action

## Current implementation boundary

- `InMemoryStore` is intentionally ephemeral.
- `JsonFileMemoryStore` is durable local storage for a single process. It uses a versioned JSON envelope, atomic replacement, restrictive permissions where supported, and fails closed on malformed/unsupported files.
- JSON storage is not a full semantic search engine, multi-process database, encryption-at-rest system, or cloud synchronization layer.
- Keep credentials out of records. For multi-process access, encryption, large-scale retrieval, or shared team state, introduce a purpose-built backend behind `MemoryStore` and test its guarantees.

## Completion criteria

Memory OS is not complete merely because storage exists. Verify:
1. Process restart preserves expected records.
2. Corrupt or unknown-schema files are never silently overwritten.
3. Failed writes do not falsely update in-memory state.
4. Retrieval returns relevant context with source, freshness, and status.
5. Working state resumes the next action without reconstructing the entire chat.
6. A real workflow improves against a baseline in a comparable retest.

## Evidence labels

- **OBSERVED**: directly returned by a tool, source, or test.
- **VALIDATED**: independently checked against an explicit acceptance criterion.
- **PROPOSED**: intended design, not yet demonstrated.
- **UNPROVEN**: insufficient evidence.
- **REJECTED**: tested and failed or contradicted.
- **SUPERSEDED**: once relevant, replaced by newer evidence or a newer decision.

Never describe an adapter as invoked when it was only configured, or describe a memory as persistent until restart behavior is tested.
