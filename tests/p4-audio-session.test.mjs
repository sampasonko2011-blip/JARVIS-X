import test from "node:test";
import assert from "node:assert/strict";
import { AudioSessionController, AUDIO_STATES } from "../hq/audio-session.mjs";

test("audio controller exposes the required deterministic states", () => {
  assert.deepEqual(AUDIO_STATES, ["IDLE", "LISTENING", "THINKING", "SPEAKING", "INTERRUPTED"]);
  const audio = new AudioSessionController();
  assert.deepEqual(audio.snapshot, { state: "IDLE", microphoneActive: false, speaking: false });
});

test("microphone activation and shutdown are explicit", () => {
  const audio = new AudioSessionController();
  audio.startListening();
  assert.equal(audio.snapshot.state, "LISTENING");
  assert.equal(audio.snapshot.microphoneActive, true);
  audio.stopListening();
  assert.equal(audio.snapshot.state, "IDLE");
  assert.equal(audio.snapshot.microphoneActive, false);
});

test("barge-in interrupts speech and returns to listening without disabling the microphone", () => {
  const audio = new AudioSessionController();
  audio.startListening();
  audio.beginSpeaking();
  assert.equal(audio.snapshot.state, "SPEAKING");
  const interrupted = audio.interrupt();
  assert.deepEqual(interrupted, { state: "INTERRUPTED", microphoneActive: true, speaking: false });
  assert.equal(audio.finishInterruption().state, "LISTENING");
});

test("speech completion preserves an explicitly active microphone", () => {
  const audio = new AudioSessionController();
  audio.startListening();
  audio.beginThinking();
  assert.equal(audio.snapshot.state, "THINKING");
  audio.beginSpeaking();
  assert.equal(audio.finishSpeech().state, "LISTENING");
});

test("kill switch returns every audio channel to idle", () => {
  const audio = new AudioSessionController();
  audio.startListening();
  audio.beginSpeaking();
  assert.deepEqual(audio.stopAll(), { state: "IDLE", microphoneActive: false, speaking: false });
});
