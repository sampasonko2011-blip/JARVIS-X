# Legacy `hq-gateway` v45 retirement plan

## Observed state (2026-11-24)

- Supabase reports Edge Function `hq-gateway` as ACTIVE, deployed version 45.
- Its deployed source directly invokes the OpenAI Chat Completions API in a three-pass flow.
- The inspected source contains authentication, email allowlisting, and rate-limit checks, but no global budget reservation or global kill-switch check.
- The current `hq-gateway-v12` route has the global budget guard and is the intended executive gateway.
- GitHub code search did not return repository references to `/functions/v1/hq-gateway`. Search-index absence is not proof that no external client, cached page, scheduled job, or third-party caller exists.

## Decision

Do not disable or redeploy the production function as part of this source-only branch. Do not enable its paid path. Its deployed configuration, allowlist, provider-key presence, recent invocation history, and external callers were not inspected.

## Safe retirement sequence (requires a separate production authorization)

1. Inventory every first-party caller in all deployed HQ pages, service workers, browser bundles, mobile shortcuts, automation, and integrations. Search all branches and deployment artifacts, not only the default-branch code index.
2. Inspect Supabase Edge Function invocation logs and request counts for a representative observation window. Do not inspect or export request bodies, tokens, or user data unless strictly necessary and separately authorized.
3. Confirm whether any legitimate traffic still reaches v45. If traffic exists, identify the caller and migrate it to v12 with explicit contract tests.
4. Verify v12 readiness independently: authenticated session, allowlist, service-role rate-limit RPC, explicit live consent, budget reservation, kill-switch, and audit-ledger behavior. Keep the live budget disabled during this work.
5. Add a compatibility/retirement test proving first-party callers no longer reference v45. Check published GitHub Pages artifacts and service-worker caches.
6. Prefer a short, reversible disablement window only after traffic is zero or migrated and the account owner explicitly approves it. Record the deployed version and an immediate re-enable procedure.
7. Disable v45 through the Supabase control plane only after that approval. Verify the function is disabled and v12 remains unaffected. Do not delete secrets until the rollback window expires.
8. After an observation period with no failed legitimate callers, remove obsolete source/configuration in a later branch and update operational documentation.

## Rollback

If a legitimate caller fails, restore the prior function state only under the account owner's approval, while keeping its paid inference path disabled. Never compensate by relaxing authentication, allowlisting, rate limits, or the v12 budget guard.

## Explicitly not done

No production function was disabled, redeployed, deleted, or reconfigured. No Edge Function logs or secret values were read. No model API was called.
