# Trusted attestation HMAC verifier

The composite bridge requires a verifier; a signature-shaped string or passing
test fixture is not authentication. `hq/attestation-verifier.mjs` provides an
HMAC-SHA-256 verifier for deployments whose trusted evidence issuer and runtime
share a server-held secret.

## Server setup

1. Generate a random secret of at least 32 bytes and store it in the server's
   secret manager as `JX_ATTESTATION_HMAC_KEY`.
2. At server startup, construct `createHmacAttestationVerifier()`.
3. Pass its returned `verifyAttestation` function to
   `runCompositeTask({ ..., verifyAttestation })`.
4. Only the trusted evidence issuer may call `signAttestation(record)`, after
   the relevant upstream checks actually complete. Never sign user-, browser-,
   or model-supplied claims.
5. Keep the secret out of client bundles, logs, prompts, and source control.
   Use the deployment's secret-management process for rotation.

The signature covers the identity, role, authorization, live-test, safety,
status, evidence ID, verification time, and expiry claims consumed by the
bridge. Verification uses constant-time comparison for well-formed SHA-256
signatures.

## Limits

HMAC proves that a holder of the shared secret signed the claims; it does not
prove the claims are true. The issuer must enforce eligibility and evidence
quality before signing. Production still needs a real trusted issuer, protected
secret management, rotation/revocation controls, access controls, live-provider
tests, and blind held-out quality/safety evaluation. This helper does not
configure deployment secrets or promote model quality.
