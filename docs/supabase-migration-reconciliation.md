# Supabase migration reconciliation — read-only audit

## Scope and observed state

Audit date: 2026-11-24. This document records repository and live Supabase metadata observed through read-only inspection. No migration was applied, reverted, repaired, or renamed.

Live Supabase project: `xfewajxkqntflfntisut`.

The active database reports these nine migration versions:

| Live version | Name |
|---|---|
| 20261023172530 | hq_secure_memory_and_execution_ledger |
| 20261023175736 | hq_least_privilege_table_grants_v2 |
| 20261023180128 | hq_authenticated_rate_limits |
| 20261023180213 | hq_rate_limit_rpc_returning_fix |
| 20261023180246 | hq_rate_limits_deny_direct_access_policy |
| 20261024185449 | hq_execution_ledger_server_only_writes |
| 20261027220313 | hq_global_budget_guard |
| 20261110112609 | restrict_hq_rate_limit_rpc_to_service_role |
| 20261110113744 | hq_xmemo_oauth_storage |

The repository currently contains five SQL migration files:

| Repository file/version | Live history comparison |
|---|---|
| 20261024185449_hq_execution_ledger_server_only_writes.sql | Exact version and name match |
| 20261025225000_hq_global_budget_guard.sql | Live history has same name at a different version (20261027220313) |
| 20261026100000_hq_rate_limit_server_only_rpc.sql | Live history has a differently named migration (20261110112609) that restricts the RPC |
| 20261102120000_hq_image_budget_guard.sql | No matching live version/name observed |
| 20261109190000_hq_xmemo_oauth_storage.sql | Live history has same name at a different version (20261110113744) |

The four live versions without an exact repository version/name pair are not assumed missing from the database. The four repository files without an exact pair are not assumed unapplied. Migration history is metadata, not a schema diff.

## Required reconciliation procedure

1. Freeze migration writes while reconciling.
2. Export the current schema and relevant function definitions from the active project, excluding all secret values and user data.
3. Inspect every repository SQL file and compare its intended effects with the live schema, grants, RLS policies, indexes, triggers, and function bodies.
4. Produce an explicit one-to-one mapping for each live migration version and repository file. Mark unmatched entries as historical, renamed, squashed, manually applied, unapplied, or unknown only when evidence supports that label.
5. Do not rewrite existing migration timestamps or insert historical rows into the migration ledger merely to make the lists look alike.
6. For any missing desired change, create a new forward-only migration with idempotent guards and a rollback/compensation plan.
7. Validate the new migration against a disposable, no-cost database or a schema-only test harness before any production approval.
8. Obtain separate explicit authorization before applying anything to the active project.

## RPC contract evidence

The active `public.consume_hq_rate_limit(uuid,text)` function is `SECURITY DEFINER` and grants EXECUTE to `service_role` and `postgres`, not browser roles. The source correction for `hq-memory-v1` therefore uses the server-side service-role credential and supplies the already authenticated user's UUID as `p_user_id`. The service-role credential must remain in Edge Function secrets and must never be sent to a browser.

## Non-goals

- No production migration was applied.
- No Edge Function was deployed.
- No secret values were read.
- No live user memory was read or written.
- No conclusion about migration equivalence is made until schema-level comparison is complete.
