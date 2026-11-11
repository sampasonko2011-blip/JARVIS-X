# Vegito Self-Audit v3 Implementation Plan

> **For agentic workers:** Use the executing-plans workflow. This branch is isolated from main; do not merge or deploy.

**Goal:** Make JARVIS-X's promotion gate require reproducible, provenance-backed, scope-appropriate evidence and make the active cognitive kernel express one shared-state Vegito identity.

**Architecture:** Extend the deterministic TypeScript self-audit evaluator with a versioned evaluation envelope, required metric/check coverage, cost and provenance gates, zero-baseline-safe reporting, and intervention-aware circuit breaking. Update the HQ cognitive-kernel envelope so specialist faculties are integrated passes over one shared state—not separate assistants or independent model votes.

**Tech Stack:** TypeScript, Node test runner, Deno-compatible JavaScript modules, GitHub Actions CI.

**Spec:** `docs/jarvis-x-self-audit-v3.md`

## Global Constraints

- Preserve one JARVIS-X executive identity and one final answer.
- No live provider calls, paid inference, secret changes, database changes, or production deployment.
- No model-council fan-out; specialist faculties share one executive state.
- Unknown or malformed evidence fails closed as UNPROVEN.
- Work only on `feature/vegeto-self-audit-v3`; do not merge to main.

## Review Focus

- Missing required metrics/checks must not pass by omission.
- Mock/deterministic runs must not substantiate reasoning-quality claims.
- Baseline and candidate must share task set, environment and protocol provenance.
- Zero baselines must not generate misleading percentage improvements.
- Repeated failures after the same intervention must trip the breaker; a genuinely changed intervention must be distinguishable.

---

### Task 1: Self-audit v3 evidence gate

**Files:**
- Modify: `src/core/self-audit.ts`
- Modify: `tests/self-audit-engine.test.mjs`
- Create: `tests/self-audit-v3.test.mjs`
- Create: `docs/jarvis-x-self-audit-v3.md`

**Interfaces:**
- Extend `SelfAuditInput` with evaluation provenance, cost guard, and intervention-aware failure history.
- Preserve `runSelfAudit(input): SelfAuditResult`; add explicit scope and metric delta reporting without side effects.

- [ ] Write tests for provenance mismatch, omitted required metrics/checks, weak/mocked quality claims, cost uncertainty/overrun, duplicate checks, zero-baseline reporting and changed-intervention retry.
- [ ] Run CI on the test-only commit and confirm the new tests fail for the expected missing gates.
- [ ] Implement fail-closed validation and promotion decisions.
- [ ] Run the complete CI workflow and inspect exact job results.

### Task 2: Shared-state Vegito cognitive-kernel contract

**Files:**
- Modify: `supabase/functions/hq-gateway-v12/cognitive-kernel.mjs`
- Create: `tests/cognitive-kernel-fusion.test.mjs`
- Modify: `docs/jarvis-x-composite-architecture-v2.md`
- Modify: `docs/jarvis-x-operating-charter.md`

**Interfaces:**
- Add a versioned fusion contract to the executive envelope.
- The contract defines one shared working state, dynamically selected faculties, structured contributions, conflict resolution, one synthesizer and one accountable output.
- Do not report faculties as independently executed agents or external models.

- [ ] Write tests proving one identity, shared-state semantics, no separate provider roster, and bounded execution.
- [ ] Confirm tests fail before the implementation change.
- [ ] Implement the envelope contract and update architecture documentation.
- [ ] Run full CI and inspect exact results.

### Task 3: Final adversarial review

- [ ] Inspect the complete diff for hidden claims, bypasses, missing validation and regressions.
- [ ] Verify CI on the exact final commit.
- [ ] Create a draft PR for review; do not merge or deploy.
