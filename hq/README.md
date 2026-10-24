# JARVIS-X HQ

JARVIS-X HQ is a progressive web app (PWA) served from the `hq/` directory. It combines the local command workspace with an authenticated Supabase gateway for the direct-chat path.

## Release state

- **Source:** the feature branch and draft PR are not the public installation.
- **Automated verification:** the latest recorded CI run for the current feature-branch head passed. See [CI run #748](https://github.com/sampasonko2011-blip/JARVIS-X/actions/runs/40129561846).
- **Live provider inference:** not yet independently verified end to end.
- **Cross-device memory:** opt-in is wired through the frontend and gateway; live XMemo recall/write, durable persistence, and account isolation still require verification.
- **Installation link:** do not treat the expected GitHub Pages URL as live until the Pages deployment workflow succeeds and the published route is checked.

## Install after publication

Once the GitHub Pages deployment has succeeded, open the verified published HQ URL in Safari on iPhone or iPad, tap **Share**, choose **Add to Home Screen**, then tap **Add**. On desktop, use the browser's install option when offered. A home-screen icon is not proof that backend services or offline network calls are operational.

## Architecture and privacy boundaries

- The static frontend is hosted separately from server-side inference.
- Provider credentials must remain in Supabase Edge Function secrets; never put them in browser code or commit them to Git.
- The gateway validates an authenticated Supabase session and checks a server-side email allowlist before billable inference.
- Cross-platform memory is opt-in per chat request. With consent off, the gateway must neither recall nor write cross-platform memory.
- The local workspace's browser storage is not a secure backup and is not automatically synchronized.
- The council/composite runtime and the direct-chat gateway are distinct paths. A three-pass call to one provider is not independent multi-model consensus.
- Automated tests use deterministic fixtures/mocks; they do not establish real provider availability, truthful model identity, durable memory, or production quality.

## Required release gates

1. Confirm the required Supabase Edge Function secrets are configured in the dashboard without exposing their values.
2. Perform an authenticated real chat request and verify the server-side audit write.
3. With memory consent off, verify no memory recall/write occurs; with consent on, verify write and later recall, including per-account isolation.
4. Review the rate-limit RPC permissions and establish provider-level/global spend limits and monitoring.
5. Confirm GitHub Pages configuration permits the deployment workflow; verify its successful run and the exact published URL.
6. Run the live browser-to-gateway smoke test on the published site.
7. Keep release claims limited to the evidence actually observed. Publication/merge and production changes require explicit owner authorization.

## Development checks

Run `npm test` and `npm run build`. CI additionally runs the Chromium browser E2E suite, syntax checks, and benchmarks. Browser automation is not a substitute for a physical-device installation test or live service verification.

## Deployment workflow

The workflow is `.github/workflows/deploy-pages.yml`. It is configured to deploy the `hq/` directory after changes reach `main` or on a manual dispatch. A feature-branch commit alone does not publish the site. Before the first release, verify the repository's Pages source and `github-pages` environment settings, then confirm the workflow output URL.

## Troubleshooting

- **Sign-in blocked:** only existing, allowlisted Supabase Auth accounts are accepted.
- **Gateway unavailable / configuration error:** check function status and required secret *presence* in Supabase; never paste secret values into chat or issue logs.
- **Chat tests pass but live chat fails:** deterministic E2E tests mock the gateway. Test authenticated live inference and audit writes separately.
- **Memory appears empty:** confirm consent was explicitly enabled for the relevant requests and verify the XMemo API contract and user-scoped data path.
- **Install option missing:** open the HTTPS published URL in a supported browser and check the manifest/service worker; verify the deployment actually succeeded first.
