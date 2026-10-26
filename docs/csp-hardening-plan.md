# HQ Content Security Policy hardening plan

## Current source audit

The current HQ document has one inline script block, one inline style block, and inline style attributes. The existing meta CSP permits `'unsafe-inline'` for both scripts and styles. Replacing it immediately with `script-src 'self'; style-src 'self'` would block current functionality.

## Safe rollout

1. **Keep the current working policy during refactoring.** Do not paste a stricter policy into the HTML until inline dependencies have been inventoried.
2. Extract the inline JavaScript into a versioned same-origin `hq.js` file. Keep provider and Supabase credentials out of this file; only the public Supabase anon/publishable key may be present in the browser.
3. Move the inline style block to a same-origin CSS file. Replace the 22 inline style attributes with CSS classes. Keep DOM event listeners in JavaScript; avoid inline event-handler attributes.
4. Prefer HTTP response headers for CSP over a meta tag, because headers support reporting and more complete directives. Start with `Content-Security-Policy-Report-Only` in staging and collect violations without blocking the app.
5. Set the actual `connect-src` to the exact required Supabase Auth and gateway origins. Avoid broad `https:` wildcards. Permit `worker-src 'self'` only if the local service worker is required. Keep `object-src 'none'`, `base-uri 'self'`, and a deliberate `form-action`.
6. After fixing all reported violations, enforce a policy without `'unsafe-inline'` for scripts or styles. If externalization is temporarily impossible, use a server-generated nonce or stable CSP hashes where the hosting architecture can reliably supply them; do not use a static nonce in a checked-in HTML file.
7. Test on iPad Safari and desktop browsers: sign-in link callback, refresh, sign-out, chat send, memory-consent controls, service worker update, and offline/static shell behavior. Verify that the policy blocks a harmless injected inline-script test in staging.
8. Only then remove `'unsafe-inline'` from the enforced policy. Do not deploy the policy or alter production headers as part of this draft PR.

## Session cleanup hardening

The session helper must remove `jx-auth-session` from sessionStorage whenever the in-memory session is cleared. A failed or malformed refresh must fail closed and leave chat disabled. Avoid persisting literal `"null"` or a session object with missing tokens.

## Evidence boundary

Source tests prove the intended code shape, not browser enforcement or runtime compatibility. CSP enforcement requires a staged browser test against the actual served response headers.
