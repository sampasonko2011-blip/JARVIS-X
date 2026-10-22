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

## Local behavior
Records remain in the current browser profile. Browser storage can be cleared and is not a backup. The service worker caches the shell after first successful load; remote model calls would still require network access and a separately implemented backend.
