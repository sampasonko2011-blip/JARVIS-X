# Security Gateway UI and health contract

**Implementation status:** the browser console is implemented in the feature branch. The actual gateway backend is **NOT DEPLOYED / UNAVAILABLE** on GitHub Pages. Do not treat the UI or a mocked test as a live security service.

## Browser behavior

- Permanent **Security Gateway** navigation entry and header-side status in the navigation item.
- Initial state is **UNAVAILABLE**, never green by default.
- “Test gateway connection” performs a real same-origin `GET ./api/v1/health`, with `credentials: same-origin`, `cache: no-store`, a five-second timeout and a response-schema check.
- `VERIFIED` means only that the endpoint returned HTTP success and explicitly reported `status: "ok"`, service identity, version, environment, `authenticated: true`, and `chat_enabled: true`. It does **not** independently prove that a provider can generate a reply.
- Provider cards are rendered only from valid server-reported entries. `configured`, `authenticated`, and `tested` remain separate booleans; missing evidence is shown as unknown/no.
- Failure, timeout, invalid content type, invalid JSON, invalid schema, and HTTP errors fail closed and keep direct chat disabled.
- Diagnostic reports contain timestamp, endpoint, status, latency, HTTP status, a client diagnostic ID, optional server trace ID, service/version/environment, and provider status claims. They intentionally exclude prompts, message bodies, cookies, authorization headers, and credentials.

### Direct chat request bounds

- The direct-chat health check uses a five-second abort timeout and must validate the same required identity/version/environment fields as the Security Gateway view before enabling chat.
- The chat POST uses a fifteen-second client-side timeout. A timeout is **delivery unknown**, not proof that the server did not process the message; users must verify server-side delivery before retrying to avoid duplicate actions.
- These client-side timeouts do not replace backend timeouts, idempotency, authorization, rate limits, or audit controls.

## Required backend contract (proposed, not live)

### `GET /api/v1/health`

Return `Content-Type: application/json` and a response equivalent to:

```json
{
  "status": "ok",
  "service": "jarvis-x-gateway",
  "version": "0.1.0",
  "environment": "production",
  "authenticated": true,
  "chat_enabled": true,
  "providers": [
    {
      "id": "provider-id",
      "configured": true,
      "authenticated": true,
      "tested": false,
      "status": "CONFIGURED",
      "model": "provider-model-id"
    }
  ]
}
```

Only report `authenticated: true` if the request's identity/session was actually validated. Never use a public unauthenticated health endpoint as proof of a logged-in user. If health must be public for monitoring, separate public liveness from authenticated session/capability status. The backend must not return credentials, provider keys, internal environment variables, or private exception details.

A trace may be returned in an `X-Request-ID` response header. Generate/validate trace IDs server-side; do not echo arbitrary untrusted input into logs.

### `POST /api/v1/chat`

The existing client expects JSON `{ "message": "...", "conversation_id": "..." }` and a JSON response containing a non-empty string `reply`. This endpoint is **not deployed by this change**. Before enabling it, the backend must enforce identity and per-user authorization, strict schemas/body limits, secure session cookies, CSRF/origin checks, rate and spend limits, timeouts, provider-side secret storage, prompt/data handling policy, safe errors, audit records, and deletion/retention rules. Never trust `conversation_id` as authorization.

## Required evidence before production use

1. Deploy backend to an approved HTTPS service; configure secret storage outside Git and the browser.
2. Verify authentication and tenant isolation using two test accounts; test expired/revoked sessions, CSRF/origin bypass, oversized inputs, rate caps, timeout, provider outage, secret-redaction and deletion/export.
3. Run an authenticated provider smoke test and capture a safe trace ID, provider/model ID, response status, latency, and usage/cost where available. Do not infer this from `GET /health`.
4. Set security headers at the HTTP layer (including a production CSP); the current static HTML meta CSP is a baseline only.
5. Run CI and deployed smoke tests against the actual backend, not only Playwright route mocks.

GitHub Pages hosts static assets only; it cannot run the server-side gateway routes. No hosting provider, provider account, API key, or new integration is automatically connected by this work.
