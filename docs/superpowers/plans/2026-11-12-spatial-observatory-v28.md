# Spatial Observatory v28 Implementation Plan

> **For agentic workers:** Use the GitHub branch `feat/spatial-observatory-v28` as the isolated workspace. Execute each task test-first; use repository Playwright/unit tests and exact-head GitHub Actions as verification.

**Goal:** Extend the current Observatory and Local Chat with shared mode/audio preferences, viewport-wide feedback, Focus origami, Sunset recovery display, integrated drawers, and no legacy navigation.

**Architecture:** Incrementally extend the existing static HTML/CSS/JS. Add a shared small state/audio module, keep canvas visuals in Observatory, and have Local Chat consume the same persisted state. No framework or backend changes.

**Tech Stack:** Static HTML, CSS, JavaScript modules/bundles, localStorage, Web Audio API, Canvas 2D, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-12-spatial-observatory-v28-design.md`

## Global Constraints
- Preserve the existing v26 visual foundation and Local Chat inference behavior.
- Keep CSP strict: no inline styles/scripts, eval, or injected style blocks.
- Audio is opt-in, short, low-volume, and gesture-gated; no medical or cognitive efficacy claims.
- localStorage preferences are shared across pages on the same origin only.
- iPadOS may suspend Safari; inactivity curtain and audio are foreground-page features only.
- Do not write to main, merge, or deploy.

## Review Focus
- Missing/invalid localStorage values: default safely to normal mode and audio off.
- AudioContext suspended after navigation: first trusted interaction resumes it without a second enable button.
- Rapid repeated touches: cap/expire ripple and audio nodes to prevent resource buildup.
- Reduced-motion preference: keep interactions usable while disabling nonessential animation.
- iPad portrait/landscape and background suspension: no overflow, false sleep/alarm claims, or hidden controls.

---

### Task 1: Shared mode and audio state contract

**Files:**
- Create: `hq/observatory-state.js`
- Modify: `hq/observatory.html`
- Modify: `hq/local-chat.html`
- Test: `e2e/observatory.spec.mjs`

**Interfaces:**
- Storage keys: `jarvis_x_active_mode` and `jarvis_x_auto_audio`.
- Export/read helpers: validated mode getter, audio-enabled getter, setters, and `playModeCue(mode, audioContext)`.
- Both pages consume the same state; audio preference defaults OFF.

- [ ] Add failing tests for shared state defaults, persistence, invalid mode fallback, and cross-page propagation.
- [ ] Run the targeted Playwright test and confirm expected failures.
- [ ] Implement the shared state module and wire both pages.
- [ ] Run targeted tests and confirm pass.

### Task 2: Observatory viewport feedback and Focus origami

**Files:**
- Modify: `hq/observatory.js`
- Modify: `hq/observatory.css`
- Test: `e2e/observatory.spec.mjs`

**Interfaces:**
- Pointerdown anywhere in viewport updates pointer position, resets the foreground inactivity timer, creates a bounded canvas ripple, and plays the cue only when opted in.
- Focus transforms left/right wings to rotateY(78deg)/rotateY(-78deg), with responsive layout preserving central controls.

- [ ] Add failing tests for viewport ripple, mode-specific cue gating, and 3D wing transform classes/computed style.
- [ ] Verify RED.
- [ ] Implement bounded ripple lifecycle and Focus CSS; retain reduced-motion fallback.
- [ ] Verify targeted and existing Observatory tests.

### Task 3: Sunset recovery, OLED curtain, and Shortcut handoff

**Files:**
- Modify: `hq/observatory.html`
- Modify: `hq/observatory.css`
- Modify: `hq/observatory.js`
- Test: `e2e/observatory.spec.mjs`

**Interfaces:**
- Sunset class activates warm red palette and a 10s breathing animation with 5s expansion and 5s contraction.
- Inactivity curtain is scheduled for 30 minutes and resets on interaction; no background execution guarantee.
- Shortcut button builds `shortcuts://run-shortcut?name=JARVIS_ALARMY&input=text&text=<encoded-time>` and navigates only after click.

- [ ] Add failing tests for Sunset class, animation timing, inactivity reset, and explicit shortcut URL/time encoding.
- [ ] Verify RED.
- [ ] Implement Sunset and handoff with clear UI labels.
- [ ] Verify targeted and existing tests.

### Task 4: Integrated drawers and legacy-link removal

**Files:**
- Modify: `hq/observatory.html`
- Modify: `hq/observatory.js`
- Modify: `hq/observatory.css`
- Modify: `hq/local-chat.html`
- Test: `e2e/observatory.spec.mjs`

**Interfaces:**
- Drawer actions: `briefs`, `vault`, `coach`; all remain on Observatory.
- User text is rendered as textContent or escaped DOM text, never raw HTML interpolation.
- Observatory and Local Chat navigation link only to each other or non-legacy local pages; no `index.html` link remains in either page.

- [ ] Add failing tests for opening/closing all drawers, safe text rendering, and zero index.html links.
- [ ] Verify RED.
- [ ] Implement drawer actions and replace legacy links with Observatory navigation.
- [ ] Verify targeted tests and existing local-chat tests.

### Task 5: Service worker and release verification

**Files:**
- Modify: `hq/sw.js`
- Modify: relevant service-worker tests and E2E coverage.

- [ ] Add failing cache-version/precache assertions for v28 shared module and all required assets.
- [ ] Verify RED.
- [ ] Bump cache to `jarvis-x-hq-shell-v28`; retain exact-route fallback and delete older HQ shell caches.
- [ ] Run full `npm test`, `npm run build`, and `npm run test:e2e` in CI.
- [ ] Inspect exact-head workflow results, PR diff, CSP, and iPad viewport tests before requesting merge review.
