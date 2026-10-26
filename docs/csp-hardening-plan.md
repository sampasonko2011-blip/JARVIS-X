# HQ Content Security Policy hardening

## Verified source changes

- Extracted the former inline application script into the same-origin `hq/hq.js` asset.
- Extracted the stylesheet into the same-origin `hq/hq.css` asset.
- Converted all 21 static and dynamically generated style attributes into 20 reusable CSS classes. The generated declarations use `!important` to preserve the original inline-style precedence.
- Updated the service worker shell cache to include both assets and bumped the cache key to `jarvis-x-hq-shell-v4`.
- Removed `'unsafe-inline'` from both `script-src` and `style-src` in the HTML meta CSP.
- Updated source and behavior tests to follow the external script and stylesheet.
- CI run #861 passed for exact head `5df929ff592457f18675c6a7cbb8240450986a67`: build, full unit suite, Chromium HQ end-to-end tests, evaluator/Mission Control/service-worker syntax checks, and both benchmarks. This validates repository behavior under CI, not deployed response headers or iPad Safari.

## Remaining release gates

1. Repository CI validation is complete for the recorded head; rerun CI after any subsequent source change and inspect served-page console/CSP violations during staging.
2. Stage `Content-Security-Policy-Report-Only` as an HTTP response header. Meta CSP does not provide the same reporting capabilities and is not evidence that the deployed response headers match the source.
3. Inspect violations and confirm the exact `connect-src` origins required by Supabase Auth and the gateway. Do not use broad origin wildcards.
4. Test sign-in callback, refresh, sign-out, chat, memory consent, service-worker update, and offline shell on iPad Safari and desktop browsers.
5. Verify that a harmless injected inline-script test is blocked under the served policy.
6. Only after those checks should production response headers be changed. This draft PR does not authorize deployment or production configuration changes.

## Session cleanup invariant

Whenever the in-memory session is cleared, remove `jx-auth-session` from `sessionStorage`. Malformed or failed refreshes must fail closed and keep chat disabled. Never persist literal `"null"` or a session object with missing tokens.

## Evidence boundary

Source tests establish the intended code shape. CI browser tests validate the repository build under its test server. Neither proves that production HTTP response headers, deployed credentials, account allowlists, provider quotas, or live paid provider execution are configured and working.
