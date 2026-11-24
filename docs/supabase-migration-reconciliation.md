# Supabase migration reconciliation — read-only inventory

**Audit date:** 2026-11-24  
**Project:** `JARVIS-X` (`xfewajxkqntflfntisut`)  
**Scope:** Git source inventory versus the active Supabase migration ledger. No migration was applied, repaired, reverted, or renamed.

## Observed inventories

### Git `main` inventory (5 files)

| Version in Git | File |
|---|---|
| `20261024185449` | `20261024185449_hq_execution_ledger_server_only_writes.sql` |
| `20261025225000` | `20261025225000_hq_global_budget_guard.sql` |
| `20261026100000` | `20261026100000_hq_rate_limit_server_only_rpc.sql` |
| `20261102120000` | `20261102120000_hq_image_budget_guard.sql` |
| `20261109190000` | `20261109190000_hq_xmemo_oauth_storage.sql` |

### Active Supabase migration ledger (9 versions)

| Live version | Recorded name |
|---|---|
| `20261023172530` | `hq_secure_memory_and_execution_ledger` |
| `20261023175736` | `hq_least_privilege_table_grants_v2` |
| `20261023180128` | `hq_authenticated_rate_limits` |
| `20261023180213` | `hq_rate_limit_rpc_returning_fix` |
| `20261023180246` | `hq_rate_limits_deny_direct_access_policy` |
| `20261024185449` | `hq_execution_ledger_server_only_writes` |
| `20261027220313` | `hq_global_budget_guard` |
| `20261110112609` | `restrict_hq_rate_limit_rpc_to_service_role` |
| `20261110113744` | `hq_xmemo_oauth_storage` |

Only `20261024185449` is an exact version match. The global-budget, rate-limit hardening, and XMemo OAuth migrations have plausible source/live counterparts under different versions, but matching names or resulting tables do **not** prove identical SQL or identical migration history. The image-budget migration exists in Git but is absent from the active ledger.

## What this means

- **OBSERVED:** Git has 5 migration files; the active project records 9 applied versions.
- **OBSERVED:** The OAuth tables exist in the active database and their grants are server-only; the active ledger records the OAuth migration as `20261110113744`, while Git names it `20261109190000`.
- **OBSERVED:** The active rate-limit RPC is restricted to `service_role`/postgres and accepts both `p_user_id` and `p_limit_key`.
- **UNPROVEN:** Whether each differently-versioned source migration is semantically equivalent to its live counterpart. A table or RPC existing is not proof that every constraint, index, policy, grant, and function body matches.
- **NOT DONE:** No migration ledger repair, SQL execution, schema mutation, or production deployment occurred.

## Safe reconciliation sequence

1. Freeze migration writes while the inventories differ.
2. Export the active schema (tables, indexes, constraints, RLS, policies, grants, functions, triggers, extensions) and preserve a timestamped backup.
3. Compare each Git migration against the active schema and live function definitions. Produce an explicit mapping: exact equivalent, partial equivalent, superseded, missing, or source-only.
4. For each live-only migration, recover its reviewed SQL from version control or an immutable deployment artifact; do not fabricate a replacement from the current schema.
5. For each differently-versioned candidate, prove semantic equivalence before recording any mapping. Never rename an already-applied migration file to make the version strings match.
6. Decide on a canonical baseline and migration-ledger repair plan. Use the Supabase migration-repair workflow only after a reviewed diff and an explicit production approval.
7. Apply no SQL merely to make the CLI history look aligned. Re-run schema, RLS, grant, RPC-signature, and Edge Function contract checks afterward.

## Release gate

This branch records the discrepancy and the safe sequence only. The production ledger remains unchanged. Migration reconciliation is **PREPARED, NOT COMPLETED** until the schema diff and version mapping are independently reviewed and authorized.
