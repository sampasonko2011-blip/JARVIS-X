# P4.1/P4.2 — Audio Full-Duplex (browser adapter)

## Scope

This tranche adds an explicit, user-controlled voice output and microphone adapter to HQ chat. It is not an always-on listener and does not claim native iPadOS integration.

## Voice output

- Uses the browser/device `speechSynthesis` API and installed system voices.
- Output is disabled by default. The user explicitly enables it.
- Only verified live-mode assistant responses are eligible for automatic playback. Mock fixtures are never spoken as AI answers.
- A user-triggered voice self-test speaks a fixed local phrase before any model response is needed.\n- The last live response can be replayed on demand.
- The adapter prefers a French (`fr-*`) system voice and otherwise uses the browser default.
- The stop control cancels speech and disables voice output.

## Microphone and barge-in

- The microphone starts only after the user presses the microphone control.
- Uses `SpeechRecognition` / `webkitSpeechRecognition` when exposed by the browser.
- Interim speech cancels an active utterance and moves the controller to `INTERRUPTED`.
- Final recognized text is inserted into the chat composer as a draft; it is never sent automatically.
- The stop control stops recognition and speech. `pagehide` also stops both.
- If recognition is unavailable, the user can still hear spoken responses and type messages.

## Explicit limitations

- Browser speech recognition availability and offline behavior vary by browser, OS version, locale, and permissions. Do not assume that recognition works offline on iPadOS Safari.
- System speech synthesis is a device/browser voice, not a cloned or custom neural JARVIS voice.
- True low-latency full-duplex audio, native `AVAudioEngine`, local offline ASR, acoustic echo cancellation, and audio streaming are not implemented by this browser adapter.
- Barge-in is available only when the browser exposes recognition concurrently with speech synthesis. Physical iPad testing is required.
- No audio recording is saved, uploaded, or placed in local chat history by this adapter. Recognized text remains an editable draft until the user sends it.

## State model

`IDLE → LISTENING → THINKING → SPEAKING → INTERRUPTED`

The deterministic controller tracks microphone and speech activity separately. The kill switch returns all channels to `IDLE`.

## Validation

Unit tests cover state transitions and the kill switch. Playwright tests use browser API fakes to verify opt-in output, live-only playback, microphone gating, barge-in cancellation, and draft-only transcription. These tests do not replace a physical iPad test.
