# Legacy `hq-gateway` retirement plan

**Audit date:** 2026-11-24  
**Live Supabase function:** `hq-gateway`, ACTIVE version 45  
**Newer route:** `hq-gateway-v12`, ACTIVE version 40  
**Policy:** no production disablement or deployment from this branch.

## Current call graph and contract evidence

- **OBSERVED:** `hq/app.js` constructs `/functions/v1/hq-gateway`. Its health check expects `mode=single-primary-multipass`, `providerConfigured=true`, and `rateLimits=database-backed`. Its chat POST sends `{ task, task_type, memory_consent }` and expects a string `output`.
- **OBSERVED:** `hq/local-chat-engine.js` uses `hq/local-memory-bridge.js`, which calls `hq-memory-v1` for memory recall/write. It is a separate local WebLLM path.
- **OBSERVED:** Supabase reports `hq-gateway` ACTIVE version 45 and `hq-gateway-v12` ACTIVE version 40.
- **OBSERVED:** The active `hq-gateway` v45 deployment is an older three-stage OpenAI route and does not contain the global budget reservation/kill-switch gate present in the current Git source at `supabase/functions/hq-gateway/index.ts`. This is a source/deployment parity defect.
- **OBSERVED:** The current Git source for `hq-gateway` has a newer budget guard. That source is not proof that the active v45 deployment has the same protection.
- **OBSERVED:** The active database rate-limit RPC is service-role-only and requires both `p_user_id` and `p_limit_key`. The older deployed route's rate-limit call uses the end-user token and an older parameter contract.
- **UNPROVEN:** Whether a request to v45 currently reaches the OpenAI provider. The static code/schema mismatch predicts fail-closed rate-limit failure, but no live chat or paid inference request was sent to test it.
- **OBSERVED:** `hq-gateway-v12` uses the current service-role RPC contract and a global budget reservation gate. The live global budget row is disabled, kill switch is false, and request reservation is null; v12 therefore remains fail-closed for paid inference under the observed configuration.
- **UNPROVEN:** End-to-end OAuth XMemo account connection, recall, and persistence on the live v12 deployment.

## Why the old route cannot be disabled yet

The main HQ frontend still calls v45 and validates its specific health contract. Simply disabling `hq-gateway` would break HQ Chat. Simply changing the URL to v12 is also unsafe: the v12 health response and feature flags differ, and the frontend's health contract, request/response handling, and failure states have not yet been migrated and tested against v12.

## Controlled retirement sequence

1. Update the HQ frontend to a versioned gateway adapter with an explicit v12 health and chat contract; do not mix old and new health fields.
2. Add contract tests for authenticated health, task submission, consent-off zero-memory behavior, consent-on memory behavior, timeout/unknown delivery, and fail-closed budget errors.
3. Test against the deployed v12 health route without invoking paid inference. Keep the live budget disabled.
4. Verify all repository call sites and published frontend assets no longer reference `hq-gateway`. Inspect deployment logs/metrics for remaining callers over a defined observation window.
5. Confirm that no external clients or older installed PWA/service-worker versions depend on v45.
6. Only after explicit approval, disable or retire v45. Preserve a rollback route that does not reintroduce an unbudgeted paid path.
7. Verify the disabled state and confirm that the current HQ frontend works through v12.

## Branch status

**PREPARED:** call graph, live/source mismatch, contract gap, and retirement sequence documented.  
**NOT DONE:** no caller cutover, production function disablement, environment change, or deployment. The active v45 route remains untouched.
