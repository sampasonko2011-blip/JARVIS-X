# HQ Content Security Policy hardening plan

## Current source audit

The current HQ document has one inline script block, one inline style block, and inline style attributes. The existing meta CSP permits `'unsafe-inline'` for both scripts and styles. Replacing it immediately with `script-src 'self'; style-src 'self'` would block current functionality.

## Safe rollout

1. **Keep the current working policy during refactoring.** Do not paste a stricter policy into the HTML until inline dependencies have been inventoried.
2. **Draft branch change:** the HQ inline JavaScript and stylesheet are now external same-origin assets (`hq/hq.js`, `hq/hq.css`). The 21 static and dynamic style attributes are converted to classes; provider secrets remain server-side.
3. Keep the compatibility CSP until the browser end-to-end suite passes against these assets. Remove `'unsafe-inline'` only in a separate verified change; do not deploy or alter production headers from this draft PR.
4. Prefer HTTP response headers for CSP over a meta tag, because headers support reporting and more complete directives. Start with `Content-Security-Policy-Report-Only` in staging and collect violations without blocking the app.
5. Set the actual `connect-src` to the exact required Supabase Auth and gateway origins. Avoid broad `https:` wildcards. Permit `worker-src 'self'` only if the local service worker is required. Keep `object-src 'none'`, `base-uri 'self'`, and a deliberate `form-action`.
6. After fixing all reported violations, enforce a policy without `'unsafe-inline'` for scripts or styles. If externalization is temporarily impossible, use a server-generated nonce or stable CSP hashes where the hosting architecture can reliably supply them; do not use a static nonce in a checked-in HTML file.
7. Test on iPad Safari and desktop browsers: sign-in link callback, refresh, sign-out, chat send, memory-consent controls, service worker update, and offline/static shell behavior. Verify that the policy blocks a harmless injected inline-script test in staging.
8. Only then remove `'unsafe-inline'` from the enforced policy. Do not deploy the policy or alter production headers as part of this draft PR.

## Session cleanup hardening

The session helper must remove `jx-auth-session` from sessionStorage whenever the in-memory session is cleared. A failed or malformed refresh must fail closed and leave chat disabled. Avoid persisting literal `"null"` or a session object with missing tokens.

## Evidence boundary

Source tests prove the intended code shape, not browser enforcement or runtime compatibility. CSP enforcement requires a staged browser test against the actual served response headers.
