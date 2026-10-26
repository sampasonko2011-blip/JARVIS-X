# Rate-limit RPC security

## Decision

The live database advisor warns that `public.consume_hq_rate_limit(text)` is executable by the `authenticated` role while marked `SECURITY DEFINER`. The function currently validates `auth.uid()`, accepts only the `minute` and `day` keys, uses an empty search path, and writes to a table with a deny-all direct-client RLS policy. Those controls are useful, but the public RPC is still an avoidable exposed privileged surface.

The draft gateway now calls a new overload with the user ID obtained from the verified Supabase Auth response. The new migration revokes client-role execution from both overloads and grants the new `(uuid, text)` overload only to `service_role`. The service-role key must remain exclusively in Edge Function secrets and must never be sent to browser code or logged.

## Coordinated rollout warning

**Do not apply this migration to production until the matching gateway revision is ready to deploy.** The currently deployed gateway still calls the old `(text)` RPC. Revoking that overload before deploying the matching gateway will cause the deployed rate-limit check to fail closed and block chat. This change is a coordinated staging migration plus Edge Function release, not a standalone production SQL fix.

## Required verification

1. Apply the migration to a disposable or staging Supabase project first.
2. Verify `anon` and `authenticated` cannot execute either overload; verify `service_role` can execute only the new overload.
3. Verify the new RPC rejects null user IDs and unsupported window keys, and maintains the 10/minute and 100/day limits.
4. Confirm the Edge Function derives the supplied user ID from the authenticated session—not from a user-controlled request field.
5. Confirm RPC failure denies paid inference and the service-role key is absent from all browser assets and logs.
6. Re-run Supabase security advisors after rollout. If the linter continues to flag a privileged public function despite the service-role-only ACL, consider moving the function into a non-exposed schema in a later coordinated change.

## Current state

- Source changes and migration are on draft PR #48.
- Production migration and Edge Function are unchanged.
- No live paid inference or production mutation was performed.
