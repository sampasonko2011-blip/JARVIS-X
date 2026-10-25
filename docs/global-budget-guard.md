# Global paid-inference budget guard

## State and safety boundary

The migration `20261025225000_hq_global_budget_guard.sql` creates an atomic UTC-day reservation guard for the five-provider council. It is deliberately **disabled by default**. Until the migration is applied and the configuration is explicitly enabled, the gateway must refuse paid inference.

The default daily ceiling is USD 10.00. This is a ceiling for **reserved worst-case request cost**, not a statement of actual billed spend. The configured per-request reservation must be a defensible upper bound for the full five-stage run, based on the exact live model IDs, maximum input/output tokens, and current provider prices. Do not choose an arbitrary reservation merely to enable chat.

Reservations are not released when a provider call fails. This conservative behavior prevents retries or concurrent requests from reusing budget that may already have been spent. It can under-utilize the daily allowance. Provider dashboards and provider-side hard spending limits remain necessary as independent safeguards.

## Activation checklist

1. Verify the migration against a staging project and review Supabase security advisors.
2. Confirm each configured model ID is available to the account and verify current input/output pricing and provider-side rate/budget controls.
3. Calculate a conservative maximum cost for one full council request, including Gemini's 32,768-token output ceiling and all other provider calls.
4. In the Supabase SQL editor, set `request_reservation_usd` to that verified upper bound and set `enabled = true` on the singleton config row. Do not enable until steps 1–3 pass.
5. Confirm the authenticated health response reports `budgetGuard.enabled = true`, `budgetGuard.killSwitchEnabled = false`, and `chatEnabled = true`.
6. Test the reservation RPC with a staging user, including duplicate reservation IDs, concurrent reservations near the cap, an unavailable RPC, and an exhausted budget. Confirm denied calls produce zero provider calls.
7. Only then consider a bounded, explicitly authorized live smoke test.

## Emergency stop and reset

Setting `kill_switch_enabled = true` blocks new paid requests immediately after the next health/reservation check. The gateway automatically enables it if a new reservation would exceed the daily ceiling. It does not automatically reset at midnight; an operator must investigate the ledger and deliberately reset it. Daily reservation totals are keyed to UTC.

Do not reset the kill switch by deleting reservation history. Preserve the ledger for auditability. A budget-guard outage, missing configuration, or invalid reservation response must fail closed.

## Known limitations

- Reservations are an upper-bound control, not exact provider billing reconciliation.
- A provider-side cost may differ from estimates if model pricing or token accounting changes.
- The current migration is a proposed repository change until separately applied and verified in the target Supabase project.
- No provider keys are needed to test the reservation logic in staging, and no keys should be pasted into GitHub, browser storage, or chat.
