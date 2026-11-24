# Supabase migration reconciliation — read-only audit

## Scope and observed state

Audit date: 2026-11-24. This document records repository and live Supabase metadata observed through read-only inspection. No migration was applied, reverted, repaired, or renamed.

Live Supabase project: `xfewajxkqntflfntisut`.

The active database reports these nine migration versions. Four have canonical source files in this branch; five are historical live migrations whose SQL is not present in this checkout:

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

The repository currently contains five SQL migration files. Four now match a live version/name exactly after the source paths were aligned to the observed Supabase ledger; the image-budget migration is not observed live:

| Repository file/version | Live history comparison |
|---|---|
| 20261024185449_hq_execution_ledger_server_only_writes.sql | Exact version and name match |
| 20261027220313_hq_global_budget_guard.sql | Exact version and name match after source-path reconciliation |
| 20261110112609_restrict_hq_rate_limit_rpc_to_service_role.sql | Exact version and name match after source-path reconciliation; source includes the live role guard |
| 20261102120000_hq_image_budget_guard.sql | No matching live version/name observed |
| 20261110113744_hq_xmemo_oauth_storage.sql | Exact version and name match after source-path reconciliation |

The five live versions without repository files are earlier baseline migrations whose SQL is not present in this checkout. The image-budget migration is present in Git but its tables/function are not observed live. Migration history is metadata, not a complete schema diff.

## Schema-level comparison performed

Read-only inspection of `information_schema.columns` and `pg_get_functiondef` adds these facts:

- The three `hq_global_budget_*` tables exist live with the columns declared by the repository migration. The live `reserve_hq_global_budget(uuid,uuid)` function has the expected reservation contract and is `SECURITY INVOKER`, matching the repository migration's intended model.
- Both `hq_xmemo_oauth_*` tables exist live with the expected columns. The live `consume_hq_xmemo_oauth_transaction(text,uuid,timestamptz)` function has the expected atomic DELETE/RETURNING behavior, empty search path, and service-role-only execution grant.
- The live `consume_hq_rate_limit(uuid,text)` function has the expected 10/minute and 100/day windows and the service-role-only grant. Its live body checks `auth.role() = 'service_role'`. The branch now contains the canonical migration path `20261110112609_restrict_hq_rate_limit_rpc_to_service_role.sql` with that same defense-in-depth check. The live migration's original SQL text was not available from the metadata listing, so equality is based on the observed live function definition and reviewed source, not a byte-for-byte migration artifact comparison. Preserve the live check; do not remove it.
- The `hq_image_budget_*` tables and `reserve_hq_image_budget` function were not present in the live schema query. The repository migration `20261102120000_hq_image_budget_guard.sql` is therefore **not observed as applied**. This is consistent with image generation remaining disabled; do not deploy or enable it as part of this branch.
- The live migration ledger includes the XMemo OAuth migration under a later timestamp than the repository file. The live schema and RPC are present, but the original migration SQL stored in Supabase's migration ledger was not available through the metadata listing. The timestamp mismatch remains a history-reconciliation item, not a reason to reapply the migration.

These are schema/function comparisons, not a complete schema dump. Indexes, triggers, constraints, grants on every relation, and all migration effects still require a full controlled diff before declaring the ledgers reconciled.


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
