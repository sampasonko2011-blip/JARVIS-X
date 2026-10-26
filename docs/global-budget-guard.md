# Global paid-inference budget guard

## State and safety boundary

The migration `20261025225000_hq_global_budget_guard.sql` creates an atomic UTC-day reservation guard for the five-provider council. It is deliberately **disabled by default**. Until the migration is applied and the configuration is explicitly enabled, the gateway must refuse paid inference.

The default daily ceiling is USD 10.00. This is a ceiling for **reserved worst-case request cost**, not a statement of actual billed spend. The configured per-request reservation must be a defensible upper bound for the full five-stage run, based on the exact live model IDs, maximum input/output tokens, and current provider prices. Gemini's 32,768-token output budget is intentionally higher because its thinking tokens count against the limit. Do not choose an arbitrary reservation merely to enable chat.

Reservations are not released when a provider call fails. This conservative behavior prevents retries or concurrent requests from reusing budget that may already have been spent. It can under-utilize the daily allowance. Provider dashboards and provider-side hard spending limits remain necessary as independent safeguards.

## Public pricing snapshot (reviewed 2026-10-26)

Use the official provider pages below as a dated planning snapshot, not a durable price guarantee. Use the highest listed non-batch rate where a provider varies rates by time or mode. Gemini's introductory rate is scheduled to end on 2026-11-30, so the conservative output-only comparison below uses its published post-intro rate.

| Stage | Model | Input USD / 1M tokens | Output USD / 1M tokens used for conservative estimate | Source |
|---|---|---:|---:|---|
| Lead | OpenAI `gpt-6.1-sol` | 2.00 | 10.00 | https://developers.openai.com/api/docs/models/gpt-6.1-sol |
| Review | DeepSeek `deepseek-flash` | 0.30 peak (cache-miss) | 1.20 peak | https://api-docs.deepseek.com/quick_start/pricing/ |
| Critic | Anthropic `claude-opus-5` | 5.00 | 25.00 | https://platform.claude.com/docs/en/models/opus-5/overview |
| Stress test | xAI `grok-4.7` | 2.00 | 6.00 | https://docs.x.ai/developers/models |
| Synthesis | Google `gemini-4-argon` | 4.00 after introductory pricing | 20.00 after introductory pricing | https://ai.google.dev/gemini-api/docs/models/gemini-4-argon |

At the current configured output ceilings alone (1,024 tokens for each of the first four stages and 32,768 for Gemini), the output-only estimate using the rates above is approximately **USD 0.70 per full council request**. This is a lower-bound component of the reservation analysis, **not** a safe per-request reservation or total cost estimate: input costs for all five calls, tokenizer behavior, any provider-specific reasoning/billing treatment, and changes in provider prices must also be bounded. Do not activate the guard using USD 0.70 as the reservation.

Before setting a reservation, derive and test a conservative maximum input-token bound for every constructed prompt, including escaped JSON, prior memory, three review outputs, and synthesis inputs. If a defensible maximum cannot be established, keep the budget guard disabled and paid inference blocked. Recheck the official price pages immediately before activation.

## Activation checklist

1. Verify the migration against a staging project and review Supabase security advisors.
2. Confirm each configured model ID is available to the account and verify current input/output pricing and provider-side rate/budget controls.
3. Calculate a conservative maximum cost for one full council request, including the 1,024-token output ceiling for the first four provider calls and Gemini's 32,768-token output ceiling (including its thinking tokens), maximum input tokens, and current provider prices.
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
