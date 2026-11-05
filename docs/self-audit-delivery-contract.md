# JARVIS-X Self-Audit Delivery Contract

Status: PROPOSED candidate contract. This document describes the ChatGPT-operated audit loop; it does not claim a background scheduler or an HQ runtime integration exists.

## Goal

Every requested daily self-audit must produce both:
1. A complete, readable executive report in the active conversation.
2. A versioned XMemo checkpoint that allows the next run to reconstruct the task, evidence, blockers, decisions, and next acceptance test.

The two outputs are separate acceptance requirements. A successful memory write does not count as user-visible report delivery; a visible report without a checkpoint does not count as a complete loop.

## Execution boundary

- Current execution mode: user-triggered/manual.
- XMemo connector: connected and invoked only when its actions return success.
- GitHub: read-only source evidence unless a specific isolated-branch change is approved.
- No background scheduler or authenticated GitHub Actions-to-XMemo transport is established by this contract.
- No automatic merges, deployments, database/configuration/permission/secrets changes, paid calls, wallet top-ups, or provider additions.
- Never store credentials, tokens, student records, or unnecessary personal data in an audit checkpoint.

## Required report sections

1. Executive outcome and date.
2. Scope and exact sources inspected.
3. Evidence ledger using OBSERVED / VALIDATED / PROPOSED / UNPROVEN / REJECTED / SUPERSEDED.
4. Capability state: AVAILABLE / CONNECTED / AUTHENTICATED / INVOKED / EXECUTED / COMPLETED / WORLD-STATE VERIFIED.
5. JX-001 through JX-007 status, blockers, and acceptance criteria.
6. Risks, privacy/security, cost, assumptions, freshness, and regressions.
7. Weakest capability, root cause, and one measurable improvement.
8. Next actions with dependencies and owner.
9. Baseline, held-out, and regression retest plan.
10. KEEP / MODIFY / REJECT / UNPROVEN recommendations.
11. Explicit list of actions not taken.

## XMemo checkpoint fields

Use one versioned working-state slot for the current loop, plus a timeline event for a significant decision or completed audit:
- run_id and audit date/time (UTC)
- sequence number and consecutive-success count (target: 5)
- report_delivery: success/failure
- checkpoint_write: success/failure
- repository, branch, exact main SHA, candidate PR/head SHA, CI run IDs/statuses
- deployed environment/version and evidence freshness, if inspected
- objective and scope
- evidence references and status labels
- JX-001..JX-007 status and blockers
- approval scope and excluded actions
- regression/failure signatures and supersession references
- next action and acceptance test

Do not increment the five-run success counter unless both report_delivery and checkpoint_write are confirmed. If either fails, record the failure and reset the consecutive-success count to zero. Unknown is never converted to success or zero.

## Evidence rules

- Bind claims to exact URLs, commit SHAs, PR numbers, CI run IDs, or returned tool records.
- Distinguish source correspondence from runtime behavior.
- A green CI result validates only the checks that actually ran on the exact candidate SHA.
- Configuration does not prove invocation or execution.
- Do not infer live model quality, memory persistence, authentication, or world-state completion from source code alone.
- Record timestamps and mark stale evidence; re-fetch before relying on old state.

## Acceptance tests

- A report is present in the same conversation turn as the audit result.
- A versioned XMemo checkpoint is successfully written and can be retrieved on the next run.
- Report and checkpoint contain matching run IDs, dates, source SHAs, statuses, and blockers.
- Deliberately simulate report-delivery failure: counter must not increment.
- Deliberately simulate checkpoint-write failure: counter must not increment.
- Deliberately supply stale or missing evidence: affected claim remains UNPROVEN.
- Five consecutive runs pass both delivery checks with no unsupported status claims.
- No paid calls, secrets, deployment, production DB/config/permissions changes, or unauthorized provider integrations occur.

## Known limitation

This contract is not an autonomous scheduler. A recurring execution requires a separately configured scheduler and a secure, authorized path to retrieve evidence, write XMemo, and surface a report. A GitHub cron job alone cannot deliver a report into a ChatGPT conversation, and a ChatGPT connector session is not automatically available to GitHub Actions.
