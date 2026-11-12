# Spatial Observatory v28 — Design

## Intent
Upgrade the existing JARVIS-X Observatory on top of the verified v26 visual foundation without replacing its working canvas, crystal, astrolabe, arrival sequence, reduced-motion behavior, or Local Chat runtime. The primary user is navigating on iPad Safari; the experience must remain responsive, accessible, local-first, and honest about browser limitations.

## Goals
- Persist one display mode (`normal`, `focus`, `sun`) and one optional audio-enabled preference in localStorage, shared by Observatory and Local Chat.
- After the user explicitly enables audio once, a pointer/touch interaction anywhere in either page triggers a visual ripple and a short mode-specific sound. A page transition may require the first user gesture to resume Web Audio because iPadOS autoplay policy does not permit reliable automatic playback on page load.
- Focus mode folds both side wings in 3D (left rotateY(78deg), right rotateY(-78deg)) while keeping the central workspace usable and visible.
- Sunset mode applies a warm red visual treatment, a 10-second breathing animation (5s expand / 5s contract), and a 30-minute foreground inactivity curtain.
- Provide an explicit user-triggered Apple Shortcuts handoff for JARVIS_ALARMY and the selected wake time. Do not claim that the web page can set or verify an iOS alarm.
- Remove all links to `index.html` from Observatory and Local Chat. Navigation remains between Observatory and Local Chat; Task Briefs, Memory Vault, and Recovery Protocol are integrated drawers.
- Bump the HQ service-worker cache to v28 and preserve exact-path navigation/cache behavior.
- Add regression tests for all required interactions, storage synchronization, no-legacy-link invariant, CSP, and iPad layouts.

## Non-goals and anti-goals
- No claim that 40 Hz/2 Hz audio entrains brainwaves, improves attention, induces sleep, changes HRV, or accelerates recovery. Frequencies are sound-design labels only.
- No continuous binaural tones, forced audio, high-volume output, flashing/strobing, or automatic sound playback without a user gesture.
- No automatic device sleep, screen lock, alarm creation, or background timer guarantee; Safari may suspend pages when backgrounded.
- No remote memory synchronization or new backend calls. Briefs and notes remain localStorage data on this device and must be escaped when rendered.
- No direct writes to `main`, production database/configuration, secrets, paid services, or provider routing.

## Approaches
1. **Replace the three Observatory files with the supplied v28 template.** Rejected: the pasted template contains malformed CSS/JavaScript fragments and discards existing working behavior.
2. **Incrementally extend the current v26 Observatory and Local Chat.** Selected: smallest regression surface; preserves existing visual and local inference foundations while adding tested mode/audio/drawer/navigation behavior.
3. **Rebuild as a framework application.** Rejected: unnecessary dependency/build complexity for the existing static HTML/CSS/JS architecture.

## Architecture
- A small shared browser module owns validated localStorage keys, mode application, opt-in audio state, and the user-gesture-gated Web Audio helper. Keep it dependency-free and compatible with the current static page/CSP.
- Observatory owns the visual canvas ripple and integrated drawers. Local Chat reads the same state and applies the same mode and audio preference without a second enable button; the first interaction on that page resumes audio if the browser suspended it.
- Audio is short, low-volume, and mode-themed: Normal harmonic cue, Focus 40 Hz beat-style cue, Sunset 2 Hz beat-style cue. These are not medical/neuroscience interventions.
- The 30-minute curtain is foreground-page inactivity only. It has an explicit wake-time handoff button to the iOS Shortcuts URL scheme; the user confirms/executes the shortcut in iOS.

## Constraints
- Preserve strict CSP: no inline styles, inline scripts, eval, or dynamically injected style blocks.
- Honor prefers-reduced-motion and keyboard operation.
- Audio starts only after an explicit enable action and a trusted user gesture; persist preference, not a browser AudioContext.
- Escape user-created brief/note text; do not interpolate raw user input into innerHTML.
- Service worker must not convert missing routes to index.html.
- Work on branch `feat/spatial-observatory-v28`; PR to main only after exact-head CI and review. No merge or deployment is authorized by this design.

## Acceptance criteria
- Same mode and audio preference are observed by both pages after navigation/reload.
- No separate Local Chat audio-enable button is required after opt-in; first interaction is sufficient to resume the browser audio context.
- Viewport pointerdown produces a visible ripple on both pages; sound is produced only if opted in and browser audio is active/gesture-authorized.
- Focus wing transforms are 3D ±78deg on desktop and do not hide controls on iPad portrait.
- Sunset red theme and 5s/5s breathing cue are visible; curtain activates after 30 minutes of inactivity while page is active.
- Shortcut handoff opens only after explicit user action and uses the chosen time.
- No `href` or navigation target to `index.html` remains in either target page.
- Service-worker cache is v28; existing offline/navigation tests remain green.
- New Playwright tests pass on exact PR head, along with full existing CI.
