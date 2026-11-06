# Trust Layer v1 — implementation status and gates

## Implemented in this branch

- `JsonFileMemoryStore` supports atomic multi-key snapshots for record + index updates and atomic multi-key deletion. A failed snapshot write restores the in-memory map.
- `MemoryOS` uses the multi-key transaction when the store supports it, and exposes guarded deletion requiring the caller's expected `updatedAt` value.
- `ApprovalAuthority` issues short-lived HMAC-SHA256 approvals bound to subject, action, resource, scope, candidate revision, audience, policy version, key id, timestamps and a unique token id.
- Verification compares the authenticated subject and every requested scope field, checks expiry, uses constant-time signature comparison, and delegates one-time token consumption to an injected replay store.
- Tests use only fixed test-only key material and an in-memory replay store.

## Explicit non-claims

This is a library boundary, not a complete production trust boundary. No production key provider, authenticated identity adapter, durable atomic replay store, or live gateway/tool-broker integration is included. The token issuer must receive an identity already authenticated by a trusted host. A caller-supplied subject is not authentication. An in-memory replay store is not replay protection across restarts or instances.

`JsonFileMemoryStore` remains single-process local storage. Atomic rename protects a snapshot from partial replacement, but does not establish multi-process locking, distributed consistency, encryption at rest, account isolation, or cross-device synchronization.

## Required integration sequence

1. Wire one `ApprovalAuthority` verifier into both the self-audit write gate and the tool broker. Remove trust in caller-supplied `approvedBy` or boolean approval flags.
2. Bind issuer identity to the existing authenticated session/account provider. If no trusted identity adapter is present, fail closed.
3. Inject signing keys from an authorized secret manager. Never commit or print key material; define rotation and revocation behavior before production use.
4. Implement durable, atomic, cross-instance `consumeOnce(jti, expiresAt)` with a uniqueness constraint / compare-and-set. If unavailable or unhealthy, deny the write.
5. Add gateway integration tests for forgery, altered payload, expired token, replay, wrong subject/action/resource/scope/revision/audience/policy, unknown/revoked key, key-provider failure and replay-store outage.
6. Run full build, typecheck, all tests, security tests, restart tests and held-out adversarial fixtures on the exact PR head.
7. Keep deployment, production database changes, provider activation, paid calls and secret/permission changes out of this PR.

## Promotion rule

The module can be considered source-level implemented only after CI passes. Production trust enforcement remains UNPROVEN until the integration sequence above is complete and verified against the deployed gateway.


## Broker integration hardening checkpoint
The HQ broker now treats caller-supplied approvals as opaque signed-token data and delegates trust to an injected verifier before policy evaluation. The verifier context binds authenticated subject, action, resource, canonical sorted scope, candidate revision, audience, policy version, request ID and idempotency key. The test fixtures use opaque-token shapes; this still does not install a production identity adapter, key manager, durable replay store or connector.

CI fixture follow-up: the opaque-token broker tests assert verifier rejection for mismatched action/request/scope and explicitly remove the authenticated subject in the incomplete-context case. Latest CI exposed two assertion/fixture mismatches; these have been corrected and require a fresh exact-head run.
