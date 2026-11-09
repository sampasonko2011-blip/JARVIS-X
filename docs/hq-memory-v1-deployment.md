# JARVIS-X isolated memory gateway (hq-memory-v1)

## Purpose

This Edge Function exposes memory recall and storage independently of model inference. It does not call OpenAI, Qwen, or any other inference provider. It reuses the server-side XMemo adapter already used by the versioned gateway.

## Required server-side configuration

Configure these in Supabase Edge Function secrets / project environment. Never put values in GitHub, the browser bundle, or chat.

- `XMEMO_API_KEY`: server-side XMemo credential. The current adapter reads this exact name.
- `JX_MEMORY_ALLOWED_EMAILS`: comma-separated exact email allowlist for memory access. Leave unset to keep the endpoint fail-closed.
- `SUPABASE_URL`: Supabase project URL (normally provided to Edge Functions).
- `SUPABASE_PUBLISHABLE_KEYS`: JSON object with a `default` publishable key, or the legacy `SUPABASE_ANON_KEY` fallback. Confirm which variable is present in the deployed runtime.

The function uses the caller's Supabase JWT for `auth/v1/user` and the self-scoped `consume_hq_rate_limit` RPC. It does not require or read the service-role key.

## Routes

Base path: `/functions/v1/hq-memory-v1`

- `POST /recall`: JSON body `{ "query": "...", "memory_consent": true }`
- `POST /remember`: JSON body `{ "task": "...", "answer": "...", "task_type": "local_chat", "memory_consent": true }`

Every request must include `Authorization: Bearer <Supabase access token>`, the project's publishable/anon `apikey` header, and explicit `memory_consent: true`. Requests without consent are rejected. The authenticated user's ID is derived server-side and is the only memory namespace accepted.

## Guardrails

- Separate from inference; no OpenAI key or model inference toggle is used.
- Dedicated exact-email allowlist; empty allowlist denies access.
- Per-user minute/day database rate limits; rate-limit errors fail closed.
- Bounded JSON body and field lengths.
- CORS allowlist for the deployed GitHub Pages origin and localhost development.
- Recall results are returned as untrusted context; clients must not treat recalled text as instructions.
- No service-role key is needed by this function.

## Before deployment

1. Confirm the XMemo account's pricing, data handling, retention, and API limits. Do not configure the credential until the user has approved those terms.
2. Confirm the Supabase runtime supplies `SUPABASE_URL` and one supported publishable-key variable.
3. Set `JX_MEMORY_ALLOWED_EMAILS` to the exact account email only after confirming the intended account.
4. Set `XMEMO_API_KEY` only after the provider checks above.
5. Deploy only this function, not the inference gateway, and keep live inference disabled.
6. Run authenticated recall/store smoke tests with explicit consent; verify user A cannot access user B's namespace.
7. Confirm no secret appears in frontend assets, Git history, CI logs, or responses.

## Current integration boundary

The local chat UI is wired in source to this endpoint with an unchecked-by-default, per-turn consent control. It reuses the signed-in HQ session in the same browser tab, refreshes an expired session, retrieves only marked untrusted context, and stores the completed local turn only when the user opted in. Local inference remains on-device; memory calls are separate HTTPS requests.

This source integration does not establish a live XMemo connection or persistent memory in the iPad UI. The XMemo key must be configured, the function deployed, and authenticated end-to-end recall/store plus cross-user isolation tested before claiming live memory is active.
