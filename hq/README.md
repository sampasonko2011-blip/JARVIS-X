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

## GitHub Pages deployment workflow
A reviewed workflow definition lives at `.github/workflows/deploy-hq-pages.yml`. It is configured to deploy the `hq/` static directory only after changes reach `main`, or when manually dispatched. This feature branch does not publish the site. Before a first deployment, the repository owner must configure GitHub Pages to use GitHub Actions and confirm the `github-pages` environment and repository policy permit the workflow. A successful workflow and the emitted deployment URL must be checked before calling the site live.

## Safe deployment direction
Serve this directory over HTTPS using a static host to test the shell. Static hosting alone cannot safely store provider secrets or implement cross-device private memory. A later backend must provide managed authentication, authorization, encrypted transport, isolated data access, retention/deletion, secret management, provider budget controls, and auditable tool execution. Never put API keys in browser JavaScript or commit them to Git.

## Regression checks

The repository's `npm test` suite includes `tests/hq-shell.test.mjs` for core surfaces and input boundaries, `tests/hq-service-worker.test.mjs` for service-worker install/activation, cache cleanup, request filtering, offline navigation fallback, shell-asset caching, and cache-quota failure recovery, and `tests/hq-behavior.test.mjs` for local persistence across app restarts, empty-input rejection, failed-write rollback, malformed-storage protection, accessible navigation state, and backup import/rejection paths. The Node-based service-worker harness remains distinct from `e2e/hq.spec.mjs`, which runs in Chromium through Playwright in CI and covers browser persistence across reload, deletion confirmation, empty-input rejection, JSON export, navigation, malformed-backup rejection, cancellation of delete-all, service-worker shell precaching, offline navigation, mobile viewport overflow, and keyboard-accessible navigation. The service worker waits for a successful cache write before completing a shell-asset response, reducing the chance of interrupted fire-and-forget cache writes. Browser automation still does not prove installation/offline behavior on a physical device or validate cross-device sync.

## Local behavior
Records remain in the current browser profile. Browser storage can be cleared and is not a backup. The service worker caches the shell after first successful load; remote model calls would still require network access and a separately implemented backend.


## Prompt console and integration roadmap (current branch)

The HQ includes a multi-format prompt workspace (conversational, structured report, JSON, action plan, code review, and research brief), local prompt drafts, and manual reply capture. Users explicitly copy the prompt or open ChatGPT separately; the page does not send prompts to any AI provider automatically.

The Integrations page is a **local planning registry**, not a live connector. OpenAI-compatible gateway, GitHub, Notion, Canva, Airtable and local model runtime are proposed integration targets only. No ChatGPT account/session, connected plugin, or cross-platform memory is inherited by the static site.

Conversation drafts and integration requests share the current browser's local storage and are included in local backup exports. They are not encrypted, authenticated or synchronized between devices. Cross-device memory requires a separately deployed backend, managed authentication, per-user authorization, secure server-side secrets, deletion/export controls, and verified tenant-isolation tests.


## Governed upgrade center (current branch)

The upgrade center checks a same-origin, schema-validated stable release manifest and records the result locally. Service-worker update discovery is triggered on app startup. This is **not** a self-modifying runtime: the static site cannot publish new code, change its own repository, or install provider adapters by itself.

Model scouting is a planned backend capability. A future scout must discover candidates, pin exact versions, run comparable quality/latency/cost/safety/privacy tests, and produce a reviewable proposal. Provider activation, credential use, paid usage, plugin scopes, destructive migrations, and production promotion require explicit authorization. Automatic discovery is permitted; automatic privilege escalation is not.


## Direct chat interface

The dedicated Chat tab renders persistent local conversation history and uses `GET /api/v1/health` plus `POST /api/v1/chat` on the same origin. The send control remains disabled until the health endpoint returns `{ "status": "ok", "chat_enabled": true, "authenticated": true }`. The chat endpoint must return a non-empty `reply` string. If the gateway is absent, fails authentication, or returns an invalid response, HQ does not fabricate an assistant answer. A message is sent only after the health gate passes.

**The static GitHub Pages release does not include these API endpoints**, so the live interface will honestly report that direct chat is not connected until a separately deployed authenticated gateway is installed. This is not the same as being connected to this ChatGPT conversation or inheriting a ChatGPT account session. Never put a provider API key in browser code.


## Upgrade proposal review loop

The Upgrade Center presents six proposed capabilities with impact, required test battery, risk, effort, rollback plan, and separate **Approve for planning** / **Dismiss** controls. Decisions persist only in this browser. Approval is not an implementation authorization, provider connection, permission grant, paid use, or deployment.

Required closed failure loop for every candidate:
1. State the expected outcome, baseline, non-goals, privacy boundary, and acceptance thresholds.
2. Run module contract tests, negative tests, failure injection, and regression tests.
3. Use an independent critic to challenge evidence, false positives/negatives, security, and missing cases.
4. Re-run against the same baseline and compare raw outcomes, latency, cost, quality, and recovery.
5. Any hard-gate failure returns the candidate to revision; repeated failure becomes rejected/superseded with evidence retained.
6. Only after passing gates is a proposal ready for your explicit review. Production activation remains a separate approval.

The current catalogue is a reviewed roadmap, not evidence that those capabilities are already implemented or tested. Each candidate must earn its own validation before any implementation or release claim.
