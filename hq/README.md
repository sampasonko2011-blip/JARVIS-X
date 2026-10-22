# JARVIS-X HQ — foundation prototype

This folder contains the first isolated, static PWA shell for JARVIS-X HQ.

## What is implemented
- Responsive dashboard and navigation
- Task briefs saved in browser localStorage
- Local memory notes with delete controls
- Evidence ledger with explicit status labels
- JSON export and local-data deletion controls
- Network status indicator
- PWA manifest, SVG icon, and basic service-worker cache for offline shell use

## What is not implemented or verified
- No authentication, account system, encryption-at-rest guarantee, remote database, or cross-device sync
- No connection to ChatGPT's internal memory or model weights
- No LLM/provider/tool execution from this page
- No real multi-agent orchestration or autonomous background execution
- No deployment or installed-device test is implied by this commit

## Safe deployment direction
Serve this directory over HTTPS using a static host to test the shell. Static hosting alone cannot safely store provider secrets or implement cross-device private memory. A later backend must provide managed authentication, authorization, encrypted transport, isolated data access, retention/deletion, secret management, provider budget controls, and auditable tool execution. Never put API keys in browser JavaScript or commit them to Git.

## Regression checks

The repository's `npm test` suite includes `tests/hq-shell.test.mjs` for core surfaces and input boundaries, `tests/hq-service-worker.test.mjs` for service-worker install/activation, cache cleanup, request filtering, offline navigation fallback, shell-asset caching, and cache-quota failure recovery, and `tests/hq-behavior.test.mjs` for local persistence across app restarts, empty-input rejection, failed-write rollback, malformed-storage protection, accessible navigation state, and backup import/rejection paths. The Node-based service-worker harness remains distinct from `e2e/hq.spec.mjs`, which runs in Chromium through Playwright in CI and covers browser persistence across reload, deletion confirmation, empty-input rejection, JSON export, navigation, malformed-backup rejection, cancellation of delete-all, service-worker shell precaching, and offline navigation. The service worker waits for a successful cache write before completing a shell-asset response, reducing the chance of interrupted fire-and-forget cache writes. Browser automation still does not prove installation/offline behavior on a physical device or validate cross-device sync.

## Local behavior
Records remain in the current browser profile. Browser storage can be cleared and is not a backup. The service worker caches the shell after first successful load; remote model calls would still require network access and a separately implemented backend.
