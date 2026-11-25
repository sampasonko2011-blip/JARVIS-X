# AI Builder — offline sandbox and L3 approval contract

**State:** source implementation on the P3 branch. No generated tool has been activated, no model was called, and no Docker image was downloaded.

## Pipeline

1. A caller supplies a proposed JavaScript module, its Node test file, a typed input/output contract and a zero-cost budget.
2. Static checks reject common dynamic execution, network, environment-secret and filesystem capability patterns. This is a first filter, not a proof of safety.
3. The independent Saboteur callback must accept the proposal.
4. The sandbox runner requires an already-cached Docker image pinned by SHA-256 digest. It never pulls.
5. The runner mounts source and tests read-only and runs Node's test runner with no network, read-only root, no host secrets, non-root UID, dropped capabilities, no-new-privileges, CPU/RAM/PID/time/output bounds.
6. A successful test result returns AWAITING_L3_APPROVAL, not activation.
7. An authenticated human session calls the ai-builder-approval Edge Function with the exact artifact hash, normalized permission contract, approval digest and explicit confirmation.
8. The server stores a user-bound approval record. Verification recomputes the digest and checks the same user's unrevoked record. Any source, test, permission or budget change changes the artifact/approval digest and invalidates the receipt.
9. Revocation is irreversible for that receipt. A later approval creates a new record.

## Important limits

- The AI Builder module is a proposal pipeline; it does not itself generate code with a model. A future generator may be connected only behind explicit model/cost consent.
- The default runner requires Docker and an exact Node image digest already cached locally. If unavailable, it fails closed; it does not install Docker, pull an image or download a model.
- The static scanner is not a complete JavaScript security proof. Runtime isolation is defense-in-depth, not a guarantee against all container escapes or kernel vulnerabilities.
- The server-side approval endpoint records an authenticated user's explicit confirmation, but it does not execute the artifact. Activation requires a separate runtime integration and a separately authorized action.
- Local fixture helpers in src/core/ai-builder.mjs are test utilities only; they are not production identity proof or activation authority.

## API contract

- POST /functions/v1/ai-builder-approval/approve — authenticated Supabase user session; body includes artifact_hash, approval_digest, contract and human_confirmed=true.
- POST /functions/v1/ai-builder-approval/verify — authenticated user session; body includes the same hash, digest and contract. Returns verified=true only for an unrevoked server record belonging to that user.
- POST /functions/v1/ai-builder-approval/revoke — authenticated user session and approval_id.

The Edge Function is source-only until deployment is separately authorized. Its database table is included in the P3 migration.
