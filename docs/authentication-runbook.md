# JARVIS-X email authentication runbook

## Observed failure

Supabase Auth logs for project `xfewajxkqntflfntisut` returned HTTP 422 with error code `otp_disabled` and message `Signups not allowed for otp` on `POST /otp`. The UI calls the email OTP/magic-link endpoint with `create_user: false`.

This message points specifically to Supabase refusing OTP sign-in because the requested flow would create a user while signup is disallowed. It does not, by itself, prove that the Email provider is disabled or that the OTP toggle is the only cause.

## Safe diagnosis sequence

1. In Supabase Dashboard → Authentication → Users, confirm the intended test email already has an Auth user. Do not create an account for an address unless it is yours or explicitly authorized.
2. In Authentication → Sign In / Providers → Email, confirm Email authentication and the intended passwordless email sign-in method are enabled. Exact labels can vary by dashboard version.
3. Keep public self-signup disabled if the product is intended to be invite-only. Existing-account-only sign-in is deliberate; do not change `create_user: false` merely to silence the error.
4. Confirm the requested redirect URL is included in Auth URL configuration and that the email template/provider is configured to send a magic link or OTP.
5. Request one sign-in link for an existing, authorized test account. Inspect the new Auth log event and the browser redirect/callback; do not infer success merely because the UI says an email was sent.
6. After callback, verify a valid Supabase session exists and a protected gateway request returns the expected authentication result.
7. Verify the gateway email allowlist separately. An authenticated account not on `JX_ALLOWED_EMAILS` should still be rejected by the gateway.

## Expected security properties

- Public self-signup remains disabled for an invite-only deployment.
- The UI never receives the Supabase service-role key.
- Missing allowlist configuration fails closed.
- A failed sign-in reports a useful error and does not imply chat was sent.
- Do not test with real paid provider calls until sign-in, allowlisting, and budget guard are independently verified in staging.

## Current state

The UI and gateway source checks pass in CI, but CI does not prove Supabase Auth dashboard settings or email delivery. Production Auth settings have not been changed as part of this PR.
