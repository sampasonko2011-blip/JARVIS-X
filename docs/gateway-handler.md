# JARVIS-X same-origin gateway handler

`server/gateway-handler.mjs` provides a framework-neutral Node HTTP handler for
the static HQ's `GET /api/v1/health` and `POST /api/v1/chat` endpoints.

## Required production wiring

- Supply a real `authenticateRequest(req)` implementation backed by a managed
  identity/session system. The sample tests use a fake bearer token only as a
  fixture; it is not production authentication.
- Supply a trusted `runtime.run({ objective })` implementation, such as the
  server-side composite runtime with a real evidence issuer and protected
  `JX_ATTESTATION_HMAC_KEY`.
- Set `allowedOrigin` to the exact production HQ origin.
- Deploy this handler only on a protected Node/serverless service. GitHub Pages
  cannot execute Node handlers; the public static site remains disconnected
  until the hosting/reverse-proxy route is configured.
- Use a shared atomic rate-limit store for multi-instance production deployments.
- Add deployment-specific CSRF/session protections and secrets management.
  Do not expose bearer tokens, provider keys, or HMAC secrets in browser code.

## Enforced behavior

- Exact origin allowlist, authenticated chat, bounded JSON bodies and message
  lengths, per-principal request limits, no-store and basic security headers.
- Health responses explicitly distinguish authenticated from unauthenticated.
- No upstream error details are reflected to clients.
- A reply is returned only for a completed runtime result marked
  `EXECUTED_NOT_QUALITY_PROMOTED`; manual handoff, partial execution, and
  errors are not converted into invented assistant replies.

The integration tests use local mock runtime responses. They validate the HTTP
boundary and failure behavior, not production identity, live providers, actual
secrets, factual accuracy, or deployment reachability.
