# JARVIS-X HQ — safe production cutover runbook

**State: PREPARED, NOT EXECUTED.** The live project is production, not a disposable staging environment. Do not run the Gemini SQL snippet as written. The current zero-budget constraint remains binding.

## Why the suggested SQL is rejected

- The proposed `global_budget_guard` table is not the schema used by the gateway. The gateway expects `hq_global_budget_config`, `hq_global_budget_daily`, `hq_global_budget_reservations`, and the atomic `reserve_hq_global_budget(uuid, uuid)` RPC from the reviewed migration.
- `check_server_rate_limit(uuid)` reads `public.request_logs`, which is not the verified rate-limit store. The gateway expects the existing `hq_rate_limits` table and `consume_hq_rate_limit(uuid, text)` RPC with 10/minute and 100/day windows.
- `SECURITY DEFINER` does not remove security risk or silence it safely. A public-schema definer function can be executable by PUBLIC unless privileges are explicitly revoked. The existing server-only RPC has a fixed empty search path and explicit service-role-only execute grants.
- Dropping/revoking the legacy RPC before the deployed gateway stops calling `consume_hq_rate_limit(text)` can break the old gateway. A generic `DROP FUNCTION old_legacy_rate_limit_function()` does not identify the actual overload and is not an executable migration plan.
- The execution-ledger migration filename was aligned in this branch to the observed live version `20261024185449_hq_execution_ledger_server_only_writes.sql` after read-only catalog checks confirmed authenticated users have only SELECT on `hq_execution_runs` and only their own-row SELECT policy remains. This repository alignment does not apply or change any production migration.

## Current verified starting point — read-only audit, 2026-11-01

- Supabase project: `xfewajxkqntflfntisut`, name `JARVIS-X`, status `ACTIVE_HEALTHY`, region `eu-west-1`, Postgres 17.11.
- Deployed Edge Functions: `hq-gateway` v11 and `hq-gateway-v12` v2 are both present. The deployed v12 source was fetched and inspected before this feature branch; it still contains the old single-OpenAI route. The Cognitive Kernel branch is a separate source candidate and is not deployed. The existence of a v12 deployment is not evidence that PR #72 is deployed.
- The live `main` HQ frontend calls `hq-gateway-v12` but still expects the old `single-engine-composite-prompt` health contract. The cognitive-kernel branch frontend expects `single-core-cognitive-kernel`. The frontend and gateway must be cut over as a coordinated pair; deploying only one side will break health/chat.
- Applied migration inventory has seven entries; latest is `20261027220313_hq_global_budget_guard`. The budget migration is already applied in production. The additive server-only rate-limit migration `20261026100000_hq_rate_limit_server_only_rpc` is not in the live migration inventory.
- Live RPC catalog: `consume_hq_rate_limit(text)` exists as `SECURITY DEFINER`; `anon` cannot execute it, but `authenticated` and `service_role` can. The new `consume_hq_rate_limit(uuid, text)` overload is absent. `reserve_hq_global_budget(uuid, uuid)` exists as `SECURITY INVOKER`, executable only by `service_role`.
- Live table grants: `hq_global_budget_config`, `hq_global_budget_daily`, `hq_global_budget_reservations`, and `hq_rate_limits` have RLS enabled, no anon/authenticated table privileges, and service-role access. `hq_execution_runs` has RLS enabled, no anon privileges, authenticated SELECT only, and service-role access.
- Live budget row: `enabled=false`, `kill_switch_enabled=false`, `daily_limit_usd=10.00`, `request_reservation_usd=NULL`. The gateway therefore must block all paid inference. This remains consistent with the user's strict €0 requirement; do not configure a reservation or activate the guard.
- Security advisor: three INFO findings report RLS-enabled budget tables with no policies (intentional alongside zero user-role table grants); one WARN finding reports authenticated users can execute the legacy SECURITY DEFINER `consume_hq_rate_limit(text)`. Do not repeat a revoke blindly: first transition the gateway to the service-role-only overload, then perform a separately reviewed legacy-overload cleanup after rollback is no longer needed.
- Performance advisor: three unused-index INFO findings; no performance change is justified by this release.
- No live provider smoke test has been run. Provider credentials, exact model IDs, account access, and provider-side spend controls are not verified. Public model documentation is not proof of account access.
- No zero-cost staging project has been verified. Under the strict €0 constraint, the production cutover cannot be fully validated against a staging environment; keep production unchanged until a genuine no-cost staging route or separately authorized controlled cutover exists.
- PR #72 remains the earlier five-provider council candidate. The new `feature/jarvis-x-cognitive-kernel` branch is separate source-only work and is not merged or deployed. Mock-based CI can verify local contracts, not live provider access or inference.

## Required order — do not skip gates

### Gate 0 — reconcile and review

1. Confirm whether a zero-cost staging project exists. If not, stop before production mutation under the current €0 constraint.
2. Review the pending additive rate-limit migration against the live catalog. The budget schema is already applied; do not reapply it.
3. For the default Cognitive Kernel, verify the configured OpenAI model ID, account access, pricing, and provider-side spending controls. Optional diagnostic providers require their own independent verification. Public model documentation is not proof of account access.

### Gate 1 — staging validation

Use a separately identified staging project. Do not use production as the first test environment.

1. Apply only the **additive** server-only rate-limit migration to staging; the budget schema is already present in production and should be reviewed, not duplicated.
2. Verify table RLS, no `anon`/authenticated table privileges, and execute permission for `consume_hq_rate_limit(uuid, text)` and `reserve_hq_global_budget(uuid, uuid)` restricted to `service_role`.
3. Test minute/day limit boundaries, concurrent reservations, duplicate reservation IDs, missing budget config, kill switch, exhausted budget, unavailable RPCs, and the rule that denied requests produce zero provider calls.
4. Verify existing-account-only email sign-in, redirect/callback, session refresh/sign-out, and allowlist behavior without enabling public signup.
5. Deploy the candidate gateway to staging and verify health plus authenticated chat behavior. Keep paid inference disabled; a budget-denied chat is expected until cost/account gates are passed.

### Gate 2 — production compatibility migration

Only after staging passes and the owner explicitly authorizes a production change window:

1. Apply the reviewed additive rate-limit migration while v11 still uses the legacy overload. This migration must not revoke the old overload.
2. Do not reapply the global-budget schema migration; verify its existing live row remains disabled with reservation NULL.
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
4. Only with a separate explicit authorization, run one bounded smoke request per provider, with a 1,024-token maximum output ceiling for Gemini. Check actual returned model IDs, usage, costs, execution ledger and failure behavior. No repeated retries.

### Gate 5 — remove the legacy overload

Only after production logs and deployed-source evidence prove the gateway exclusively uses `consume_hq_rate_limit(uuid, text)` and rollback to v11 is no longer required:

1. Apply a separate, reviewed cleanup migration that revokes `EXECUTE` on `public.consume_hq_rate_limit(text)` from `PUBLIC`, `anon`, and `authenticated`.
2. Confirm no user-role execute privilege remains, then rerun security advisors.
3. Do not drop the overload until dependency and rollback checks prove it is unused.

## Explicit non-goals of this runbook

This file does not authorize a production deployment, production migration, secret change, PR merge, paid API call, or budget activation. It defines a verified, reversible sequence and preserves the fail-closed behavior. Repository CI is not evidence that production gates have passed.


## Explicit zero-provider mock mode (code-only; not deployed)

- Mock requests must be authenticated, allowlisted and pass the existing database-backed minute/day rate limits.
- Caller must explicitly send `mode: "mock"` and the server-side `JX_ENABLE_MOCK_MODE` flag must equal `true`. Disabled mock returns `403 mock_mode_disabled` and never falls through to live inference.
- The deterministic module simulates five clearly labeled stages and declares `provider_calls: 0`. It has no network or environment access.
- The mock path does not read provider keys, reserve paid-inference budget, contact providers, or access/write memory. The execution ledger records `provider: mock`; audit-write failure returns 503.
- This is code and CI coverage only, not proof of deployed authenticated behavior. Do not enable the flag or deploy before reviewing auth, allowlist, rate-limit and budget prerequisites. Keep live inference disabled under the $0 constraint.
