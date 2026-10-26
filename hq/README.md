# JARVIS-X HQ — static beta shell

This branch proposes a **frontend-only beta release**. It does not deploy a new Supabase Edge Function, apply database migrations, alter Auth settings, add provider secrets, or make paid model calls.

## What this release does
- Provides the installable PWA shell and local task, memory, and evidence workspaces.
- Keeps local records in this browser profile, with export/import and encrypted portable backups.
- Provides one JARVIS-X chat surface; the send button remains disabled until an authenticated session and the exact five-provider gateway health contract, configured providers, and active budget guard are verified.
- Labels image prompts, integrations, remote execution, and cross-device memory according to their real boundaries; it does not claim a prompt is a generated image or a listed connector is connected.
- Stores no provider API keys in the browser.

## What it does not enable
The currently deployed production gateway is v11 and does not implement the new five-provider council contract. Therefore this frontend-only beta must keep direct chat unavailable until the backend rollout is independently tested. A successful static deployment is not proof of model inference, durable cross-device memory, image generation, or executable plugins.

## Authentication
Only existing accounts are intended. Do not enable public signup as a workaround for `otp_disabled`. Allowing a redirect URL or CORS origin does not enable the Supabase Email OTP provider; that provider setting must be checked separately by the project owner.

## Deploy
The repository Pages workflow publishes `hq/` after changes reach `main`. Verify the workflow result and published URL after merge. This branch contains only static frontend assets and tests; it does not include gateway code or database migrations.

## Local verification
Run `npm test` and `npm run build`. CI browser tests do not replace a real authenticated session test on the published site.
