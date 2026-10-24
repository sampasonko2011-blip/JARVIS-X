# JARVIS-X protected gateway deployment

The gateway now has concrete adapters for Supabase Auth session verification and
read-only loading of HMAC-signed evidence from a private server-local file. The
server entrypoint uses a single-primary multi-pass runtime: one attested model
performs a lead pass, a self-critique pass, and a final synthesis pass. This is
iterative synthesis, not an independent multi-provider council. This is
application code, not a deployed service.

## Required environment

- `PORT`: port supplied by the host (defaults to 8080).
- `JX_ALLOWED_ORIGIN`: exact origin of the hosted HQ, e.g.
  `https://sampasonko2011-blip.github.io` only if that is the actual page origin.
- `SUPABASE_URL`: HTTPS URL for the Supabase Auth project.
- `SUPABASE_ANON_KEY`: publishable/anon key for that same project. Never use
  a service-role key for this gateway.
- `JX_ATTESTATION_HMAC_KEY`: at least 32 random bytes, held only in the host's
  secret manager.
- `JX_MODEL_REGISTRY_PATH`: absolute path to a controlled registry JSON file
  containing a top-level `candidates` array.
- `JX_ATTESTATIONS_PATH`: absolute path to a protected JSON array of signed
  attestation records. The single-primary server path requires a valid record
  with `stageRole: "primary"`.
- Provider keys only for provider adapters that have been explicitly authorized
  and approved for this environment.

## Evidence source requirements

The file loader does not mint attestations and must not be fed from browser
input or model output. Each record must be signed using the same HMAC secret,
and must represent a real, independently performed authorization, live-call,
safety, and evidence check for the exact provider/model identity. HMAC verifies
integrity and signer possession, not the truth of a claim. Do not create
`WORLD_STATE_VERIFIED` records just to make the runtime run. Until a controlled
evaluator/approval process exists and has produced real records, the correct
outcome is a safe manual handoff.

The registry and evidence files must be mounted read-only where possible, owned
by the service account, and not writable by group/other users. The code rejects
group/world-writable files on POSIX hosts. For production, prefer a managed
evidence store with immutable audit history and key rotation over a local file.

## Authentication and deployment

The Supabase adapter sends the bearer access token to the project's Auth
`/auth/v1/user` endpoint and uses only the verified user ID returned by Auth.
It rejects missing, invalid, expired, and anonymous sessions. This does not
create a login UI: the HQ must use a legitimate Supabase Auth flow and send the
current access token to the gateway.

Build/run with Node 22 or newer:
`node server/index.mjs`

Use a protected Node host with TLS, server-side secrets, health monitoring,
log redaction, deployment rollback, and shared rate limiting if multiple
instances run. Do not put provider keys or the HMAC secret into GitHub Pages,
browser bundles, localStorage, or source control. GitHub Pages remains the
static frontend and must not be treated as the backend.

The built-in in-memory rate limiter is suitable only for a single instance.
Before horizontal scaling, replace it with an atomic shared limiter. Add a
managed evidence issuer/store and a production session setup before enabling
provider calls. The self-critique stage uses the same configured model as the
lead and synthesis stages, so it must never be presented as independent
consensus. Tests use mock sessions and mock providers; they do not prove
deployment, live credentials, factual correctness, or model quality.
