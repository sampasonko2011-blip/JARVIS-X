# Composite server runtime integration

`hq/composite-server.mjs` is the server-side composition boundary. It constructs
credential-gated provider adapters, creates the HMAC attestation verifier from
`JX_ATTESTATION_HMAC_KEY`, and injects both into `runCompositeTask`. The public
HQ remains a static frontend; this module is not an HTTP endpoint and is not
automatically activated by GitHub Pages.

## Integration contract

- Instantiate this module only in a trusted server process.
- Pass a registry loaded from controlled configuration.
- Implement `loadAttestations` using a trusted evidence store/issuer. Do not read
  attestation records from a browser request, user upload, or model response.
- Store a random 32-byte-or-longer `JX_ATTESTATION_HMAC_KEY` in a server secret
  manager. Do not commit it or expose it to browser code.
- Provide only provider API credentials required for the registry candidates.
- Call `runtime.run({ objective })` from an authenticated, rate-limited server
  route. Add request-size limits, authorization, abuse controls, and audit-safe
  logging at that route. Never return credentials or raw provider error details.
- The trusted evidence issuer must perform the real authorization, live provider
  test, safety checks, and evidence validation before signing each record.

The integration test uses mock HTTP responses. It validates server wiring and
fail-closed behavior, not actual provider availability, model identity at the
remote service, production secrets, factual accuracy, or quality promotion.
The returned completed status remains `EXECUTED_NOT_QUALITY_PROMOTED`.

GitHub Pages serves static assets only. To run this composite runtime for real,
deploy it to a protected Node server or serverless function, configure secrets
there, and point a separately reviewed authenticated frontend route at it.
Never put provider keys or the HMAC key in `hq/**` static files.
