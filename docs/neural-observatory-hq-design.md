# JARVIS-X Neural Observatory HQ

## Approved visual brief
- Direction: Neural Nexus fused with Stark Observatory; original JARVIS-X identity.
- Centerpiece: retain the existing animated Earth/globe and three orbital rings; layer a subtle neural field and a larger energy-sphere impression around it.
- Lighting: deep electric blue and cyan as primary illumination; restrained gold/amber for selected orbit, telemetry emphasis, and state accents.
- Density: advanced telemetry, grouped into readable responsive modules rather than visual noise.
- Tone: premium observatory, engineered instrument, calm executive command surface. No copied movie logos, character likenesses, or trademark UI replicas.

## Interaction and accessibility
- Existing navigation, IDs, local storage, authentication and gateway flows must remain unchanged.
- Decorative visuals must not be presented as operational telemetry.
- Status labels must remain evidence-based; XMemo live read/write is unverified until an authenticated round-trip test.
- Respect reduced-motion preferences, keyboard focus, contrast, safe-area insets and narrow iPad widths.
- No new external fonts, remote image hosts, analytics, or paid calls.

## Architecture consolidation
1. Keep one JARVIS-X executive identity and the existing v12 gateway as the sole candidate server boundary.
2. Keep XMemo as the durable memory provider behind the existing consent-gated adapter; do not add a second incompatible recall API.
3. Keep browser-local WebLLM separate from hosted inference. The browser engine currently has bounded in-tab history and no network/private-HQ access.
4. Make memory recall and store explicitly opt-in per authenticated user; preserve redaction, UUID-scoped paths, bounded context, timeouts and fail-closed handling.
5. Keep dynamic sampling deterministic and request-scoped. Do not mutate a shared model instance's temperature between concurrent requests.
6. Treat external models, image tools and connectors as capability adapters with independent authorization, budget reservation, audit receipts and explicit user approval.
7. Add durable working-state records only after schema, RLS, retention, export/deletion and cross-user isolation tests are reviewed.

## Acceptance gates
- Existing HQ views and local chat continue to work.
- No JavaScript console errors and no broken navigation.
- Visual rail is responsive at iPad portrait/landscape and desktop.
- Reduced-motion mode disables decorative animation.
- XMemo is not marked connected until authenticated recall -> store -> recall succeeds for the same user.
- No provider API call or paid operation is enabled by this visual release.
