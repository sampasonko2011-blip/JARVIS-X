# HQ Memory Gateway v1

## Purpose

hq-memory-v1 is an isolated, authenticated memory data-plane endpoint. It supports memory recall and storage without invoking the JARVIS-X inference gateway, OpenAI, or any other model provider.

It is source-only until deployed and configured. Missing credentials fail closed.

## Routes

Base URL: https://<project-ref>.supabase.co/functions/v1/hq-memory-v1

- POST /recall
- POST /remember

Both routes require a valid Supabase user access token and an exact email match in the server-side JX_MEMORY_ALLOWED_EMAILS comma-separated allowlist. Anonymous sessions are rejected.

### Recall request

    {
      "query": "What did we decide about the local memory architecture?",
      "memory_consent": true
    }

Successful response includes context and context_is_untrusted: true. Clients must treat recalled text as untrusted reference material, never as instructions.

### Remember request

    {
      "task": "User-approved task summary",
      "answer": "The assistant's response",
      "task_type": "local_chat",
      "memory_consent": true
    }

Successful response: {"ok":true,"status":"stored"}.

Consent is required independently on every request. Clients should default the control to off and reset it after each turn. Do not send secrets or sensitive personal information to memory.

## Server-side configuration

Required:
- XMEMO_API_KEY: XMemo REST API key with memory read and write permissions. Keep it only in Supabase Edge Function secrets.
- JX_MEMORY_ALLOWED_EMAILS: comma-separated exact email allowlist.
- Supabase's project URL and publishable/legacy anon key runtime variables.

The gateway uses the caller's Supabase JWT for consume_hq_rate_limit(p_limit_key). That database function derives the user from auth.uid(); do not call it with a service-role token or pass a client-supplied user ID.

The XMemo adapter sends X-API-Key server-side and scopes each memory path to the authenticated Supabase user UUID. The API key is never returned to the browser.

## Security boundaries

- No model inference, OpenAI key, model provider, or cloud fallback is used.
- Email allowlist, session authentication, per-request consent, and rate limiting are mandatory.
- Request bodies and recall context are bounded.
- Browser origins are allowlisted; non-browser requests still require a valid bearer session.
- XMemo failures return bounded errors and do not silently fall back to another provider.
- The existing inference gateway remains separate and unchanged.

## Deployment gate

Do not deploy until CI passes, the source is reviewed, the XMemo Free account/key scope is verified, and deployment is explicitly approved. Do not enable live inference as part of memory setup.