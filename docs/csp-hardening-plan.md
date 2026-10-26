# HQ Content Security Policy hardening

## Verified source changes

- Extracted the former inline application script into the same-origin `hq/hq.js` asset.
- Extracted the stylesheet into the same-origin `hq/hq.css` asset.
- Converted all 21 static and dynamically generated style attributes into 20 reusable CSS classes. The generated declarations use `!important` to preserve the original inline-style precedence.
- Updated the service worker shell cache to include both assets and bumped the cache key to `jarvis-x-hq-shell-v4`.
- Removed `'unsafe-inline'` from both `script-src` and `style-src` in the HTML meta CSP.
- Updated source and behavior tests to follow the external script and stylesheet.
- The last CI run before strict CSP enforcement passed build, all unit tests, Chromium end-to-end tests, syntax checks, and benchmarks. The strict-CSP commit must pass CI independently before being considered validated.

## Remaining release gates

1. Verify the strict-CSP revision through CI, including Chromium end-to-end tests and console/CSP violations.
2. Stage `Content-Security-Policy-Report-Only` as an HTTP response header. Meta CSP does not provide the same reporting capabilities and is not evidence that the deployed response headers match the source.
3. Inspect violations and confirm the exact `connect-src` origins required by Supabase Auth and the gateway. Do not use broad origin wildcards.
4. Test sign-in callback, refresh, sign-out, chat, memory consent, service-worker update, and offline shell on iPad Safari and desktop browsers.
5. Verify that a harmless injected inline-script test is blocked under the served policy.
6. Only after those checks should production response headers be changed. This draft PR does not authorize deployment or production configuration changes.

## Session cleanup invariant

Whenever the in-memory session is cleared, remove `jx-auth-session` from `sessionStorage`. Malformed or failed refreshes must fail closed and keep chat disabled. Never persist literal `"null"` or a session object with missing tokens.

## Evidence boundary

Source tests establish the intended code shape. CI browser tests validate the repository build under its test server. Neither proves that production HTTP response headers, deployed credentials, account allowlists, provider quotas, or live paid provider execution are configured and working.
