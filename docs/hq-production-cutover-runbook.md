# JARVIS-X HQ — safe production cutover runbook

**State: PREPARED, NOT EXECUTED.** The live project is production, not a disposable staging environment. Do not run the Gemini SQL snippet as written.

## Why the suggested SQL is rejected

- The proposed `global_budget_guard` table is not the schema used by the gateway. The gateway expects `hq_global_budget_config`, `hq_global_budget_daily`, `hq_global_budget_reservations`, and the atomic `reserve_hq_global_budget(uuid, uuid)` RPC from the reviewed migration.
- `check_server_rate_limit(uuid)` reads `public.request_logs`, which is not the verified rate-limit store. The gateway expects the existing `hq_rate_limits` table and `consume_hq_rate_limit(uuid, text)` RPC with 10/minute and 100/day windows.
- `SECURITY DEFINER` does not remove security risk or silence it safely. A public-schema definer function can be executable by PUBLIC unless privileges are explicitly revoked. The existing server-only RPC has a fixed empty search path and explicit service-role-only execute grants.
- Dropping/revoking the legacy RPC before the deployed gateway stops calling `consume_hq_rate_limit(text)` can break the old gateway. A generic `DROP FUNCTION old_legacy_rate_limit_function()` does not identify the actual overload and is not an executable migration plan.
- The live database has migration-history drift for the execution-ledger migration. Resolve that discrepancy before applying repository migrations to production; do not mark old migrations applied by guesswork.

## Current verified starting point

- Supabase project: `xfewajxkqntflfntisut`, status `ACTIVE_HEALTHY`, region `eu-west-1`.
- Live gateway: `hq-gateway` version 11, legacy OpenAI three-pass implementation, JWT verification disabled at the platform edge (the handler performs its own Supabase user verification).
- Live migration inventory: six migrations, latest `20261024185449_hq_execution_ledger_server_only_writes`.
- The global-budget and server-only rate-limit migrations in this branch are absent from that inventory.
- The server-only rate-limit migration has been changed to be additive/backward-compatible: it adds the service-role-only `(uuid, text)` overload while deliberately retaining the legacy `(text)` overload during transition.
- The budget guard is designed to remain disabled until the exact models, account access, full-request reservation, and provider-side spending controls are verified. No live provider smoke test has been authorized or performed.

## Required order — do not skip gates

### Gate 0 — reconcile and review

1. Inspect the exact deployed migration definitions and compare them with the repository, especially `hq_execution_runs` and `hq_rate_limits`.
2. Resolve the execution-ledger migration timestamp/name drift without fabricating migration history.
3. Review both pending migrations and confirm the Supabase service role has the intended table/RPC privileges. Run security advisors after staging changes.
4. Confirm all five model IDs and provider accounts are actually available to the intended API keys. Public model documentation is not proof of account access.

### Gate 1 — staging validation

Use a separately identified staging project. Do not use production as the first test environment.

1. Apply the global-budget migration and the **additive** server-only rate-limit migration to staging.
2. Verify table RLS, no `anon`/authenticated table privileges, and execute permission for `consume_hq_rate_limit(uuid, text)` and `reserve_hq_global_budget(uuid, uuid)` restricted to `service_role`.
3. Test minute/day limit boundaries, concurrent reservations, duplicate reservation IDs, missing budget config, kill switch, exhausted budget, unavailable RPCs, and the rule that denied requests produce zero provider calls.
4. Verify existing-account-only email sign-in, redirect/callback, session refresh/sign-out, and allowlist behavior without enabling public signup.
5. Deploy the candidate gateway to staging and verify health plus authenticated chat behavior. Keep paid inference disabled; a budget-denied chat is expected until cost/account gates are passed.

### Gate 2 — production compatibility migration

Only after staging passes and the owner explicitly authorizes a production change window:

1. Apply the reviewed additive rate-limit migration while v11 still uses the legacy overload. This migration must not revoke the old overload.
2. Apply the reviewed global-budget schema migration with the guard still disabled and reservation NULL.
3. Verify both RPC signatures and their permissions using SQL catalog queries; rerun security advisors. If migration-history drift is unresolved, STOP.

### Gate 3 — gateway cutover

1. Deploy the reviewed gateway revision that uses the verified user ID with the new server-only rate-limit RPC and requires a successful budget reservation before any provider call.
2. Immediately verify the deployed version/source hash, authenticated health response, origin/CORS behavior, allowlist, rate limits, and that missing/disabled budget configuration blocks inference.
3. If any verification fails, roll back the gateway to the known version 11 deployment while retaining the additive migration. Do not revoke the legacy RPC during rollback.

**Important:** because the new gateway deliberately fails closed when the budget guard is disabled, five-provider chat will remain blocked after cutover until the cost guard is validly configured. Do not enable it just to make the UI appear operational.

### Gate 4 — budget and provider activation

1. Verify exact provider model IDs, account permissions, API compatibility, current pricing and provider-side hard spending controls.
2. Recheck the documented $4.00/request candidate. It is an estimate, not a provider quote. Confirm input-token bounds, endpoint pricing tiers, output-token ceilings, and reasoning-token billing for every stage.
3. Set a reservation and enable the guard only after the full bound is verified. Keep the daily cap at or below the reviewed limit.
4. Only with a separate explicit authorization, run one bounded smoke request per provider, including the 32,768-token Gemini output ceiling. Check actual returned model IDs, usage, costs, execution ledger and failure behavior. No repeated retries.

### Gate 5 — remove the legacy overload

Only after production logs and deployed-source evidence prove the gateway exclusively uses `consume_hq_rate_limit(uuid, text)` and rollback to v11 is no longer required:

1. Apply a separate, reviewed cleanup migration that revokes `EXECUTE` on `public.consume_hq_rate_limit(text)` from `PUBLIC`, `anon`, and `authenticated`.
2. Confirm no user-role execute privilege remains, then rerun security advisors.
3. Do not drop the overload until dependency and rollback checks prove it is unused.

## Explicit non-goals of this runbook

This file does not authorize a production deployment, production migration, secret change, PR merge, paid API call, or budget activation. It defines a verified, reversible sequence and preserves the fail-closed behavior. Repository CI is not evidence that production gates have passed.
