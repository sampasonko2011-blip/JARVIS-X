export const AUDIO_STATES = Object.freeze(["IDLE", "LISTENING", "THINKING", "SPEAKING", "INTERRUPTED"]);

export class AudioSessionController {
  #state = "IDLE";
  #microphoneActive = false;
  #speaking = false;

  get snapshot() {
    return Object.freeze({ state: this.#state, microphoneActive: this.#microphoneActive, speaking: this.#speaking });
  }

  startListening() {
    this.#microphoneActive = true;
    if (!this.#speaking) this.#state = "LISTENING";
    return this.snapshot;
  }

  stopListening() {
    this.#microphoneActive = false;
    if (!this.#speaking) this.#state = "IDLE";
    return this.snapshot;
  }

  beginThinking() {
    this.#speaking = false;
    this.#state = "THINKING";
    return this.snapshot;
  }

  beginSpeaking() {
    this.#speaking = true;
    this.#state = "SPEAKING";
    return this.snapshot;
  }

  interrupt() {
    if (!this.#speaking) return this.snapshot;
    this.#speaking = false;
    this.#state = "INTERRUPTED";
    return this.snapshot;
  }

  finishSpeech() {
    this.#speaking = false;
    this.#state = this.#microphoneActive ? "LISTENING" : "IDLE";
    return this.snapshot;
  }

  finishInterruption() {
    this.#state = this.#microphoneActive ? "LISTENING" : "IDLE";
    return this.snapshot;
  }

  stopAll() {
    this.#microphoneActive = false;
    this.#speaking = false;
    this.#state = "IDLE";
    return this.snapshot;
  }
}
