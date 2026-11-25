import { AudioSessionController } from "./audio-session.mjs";

(() => {
  const view = document.querySelector("#view-chat");
  const input = document.querySelector("#chat-compose");
  const enabled = document.querySelector("#jx-audio-enabled");
  const testVoiceButton = document.querySelector("#jx-audio-test-voice");
  const listenButton = document.querySelector("#jx-audio-listen");
  const stopButton = document.querySelector("#jx-audio-stop");
  const replayButton = document.querySelector("#jx-audio-replay");
  const stateLabel = document.querySelector("#jx-audio-state");
  const status = document.querySelector("#jx-audio-status");
  if (!view || !input || !enabled || !testVoiceButton || !listenButton || !stopButton || !replayButton || !stateLabel || !status) return;
  if (view.dataset.audioReady === "true") return;
  view.dataset.audioReady = "true";

  const controller = new AudioSessionController();
  const recognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const speechAvailable = typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance === "function";
  let recognition = null;
  let listeningRequested = false;
  let lastAssistantText = "";
  let activeUtterance = null;

  const render = (message) => {
    const snapshot = controller.snapshot;
    stateLabel.textContent = snapshot.state;
    view.dataset.audioState = snapshot.state.toLowerCase();
    listenButton.setAttribute("aria-pressed", String(snapshot.microphoneActive));
    listenButton.textContent = snapshot.microphoneActive ? "MICROPHONE ACTIF · ARRÊTER" : "ACTIVER MICROPHONE";
    listenButton.disabled = !recognitionConstructor || !speechAvailable && !recognitionConstructor;
    replayButton.disabled = !lastAssistantText || !speechAvailable;
    testVoiceButton.disabled = !speechAvailable || !enabled.checked;
    stopButton.disabled = snapshot.state === "IDLE" && !enabled.checked;
    if (message) status.textContent = message;
  };

  const cancelSpeech = () => {
    if (speechAvailable) window.speechSynthesis.cancel();
    activeUtterance = null;
  };

  const stopRecognition = () => {
    listeningRequested = false;
    if (recognition) {
      try { recognition.stop(); } catch { /* Already stopped. */ }
    }
    recognition = null;
  };

  const stopAll = (message = "Audio arrêté. Microphone désactivé et synthèse vocale annulée.") => {
    stopRecognition();
    cancelSpeech();
    enabled.checked = false;
    controller.stopAll();
    render(message);
  };

  const speak = (text) => {
    if (!enabled.checked || !speechAvailable || typeof text !== "string" || !text.trim()) return false;
    cancelSpeech();
    const utterance = new window.SpeechSynthesisUtterance(text.trim().slice(0, 8000));
    utterance.lang = "fr-FR";
    utterance.rate = 1;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices?.() || [];
    const frenchVoice = voices.find((voice) => /^fr([-_]|$)/i.test(voice.lang));
    if (frenchVoice) utterance.voice = frenchVoice;
    activeUtterance = utterance;
    controller.beginSpeaking();
    render(frenchVoice ? "Voix système française sélectionnée." : "Voix système activée. La voix française dépend des voix installées sur l'appareil.");
    utterance.onend = () => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      controller.finishSpeech();
      render("Lecture terminée.");
    };
    utterance.onerror = () => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      controller.finishSpeech();
      render("La synthèse vocale a échoué dans ce navigateur.");
    };
    window.speechSynthesis.speak(utterance);
    return true;
  };

  const startRecognition = () => {
    if (!recognitionConstructor) {
      render("Reconnaissance vocale indisponible dans ce navigateur. Tu peux toujours utiliser la voix de sortie et saisir ton message.");
      return;
    }
    if (recognition) return;
    try {
      recognition = new recognitionConstructor();
      recognition.lang = "fr-FR";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => {
        controller.startListening();
        render("Microphone actif à ta demande. La transcription reste un brouillon jusqu'à ton envoi.");
      };
      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let i = event.resultIndex || 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          const transcript = result?.[0]?.transcript || "";
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        if (interimText.trim() && controller.snapshot.speaking) {
          cancelSpeech();
          controller.interrupt();
          render("Interruption vocale détectée · lecture arrêtée.");
        }
        if (finalText.trim()) {
          const prefix = input.value.trim();
          input.value = [prefix, finalText.trim()].filter(Boolean).join(prefix ? " " : "");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          controller.finishInterruption();
          render("Transcription ajoutée au brouillon. Vérifie-la avant d'envoyer.");
        }
      };
      recognition.onerror = (event) => {
        controller.stopListening();
        listeningRequested = false;
        recognition = null;
        render(event.error === "not-allowed" ? "Permission microphone refusée. Aucun enregistrement n'est conservé." : "Reconnaissance vocale indisponible : " + String(event.error || "erreur inconnue") + ".");
      };
      recognition.onend = () => {
        recognition = null;
        listeningRequested = false;
        controller.stopListening();
        render("Microphone arrêté. Aucun enregistrement en arrière-plan.");
      };
      listeningRequested = true;
      recognition.start();
    } catch (error) {
      recognition = null;
      listeningRequested = false;
      controller.stopListening();
      render("Impossible d'activer le microphone : " + String(error?.message || error) + ".");
    }
  };

  enabled.addEventListener("change", () => {
    if (!enabled.checked) {
      cancelSpeech();
      controller.finishSpeech();
      render("Voix désactivée. Le microphone reste indépendant et doit être activé séparément.");
      return;
    }
    if (!speechAvailable) {
      enabled.checked = false;
      render("La synthèse vocale système n'est pas disponible dans ce navigateur.");
      return;
    }
    render("Voix de sortie activée. Les réponses JARVIS-X reçues en mode live pourront être lues.");
  });

  testVoiceButton.addEventListener("click", () => {
    if (!enabled.checked) { render("Active la voix de sortie avant le test."); return; }
    speak("JARVIS-X est prêt. La voix système fonctionne. Active le microphone uniquement lorsque tu souhaites parler.");
  });

  listenButton.addEventListener("click", () => {
    if (listeningRequested || recognition) {
      stopRecognition();
      controller.stopListening();
      render("Microphone désactivé.");
      return;
    }
    startRecognition();
  });

  stopButton.addEventListener("click", () => stopAll());

  replayButton.addEventListener("click", () => {
    if (!lastAssistantText) {
      render("Aucune réponse à relire.");
      return;
    }
    if (!enabled.checked) {
      render("Active d'abord la voix de sortie pour lire la dernière réponse.");
      return;
    }
    speak(lastAssistantText);
  });

  window.addEventListener("jx:assistant-response", (event) => {
    const detail = event.detail || {};
    if (detail.mode !== "live") {
      controller.finishSpeech();
      render("Réponse de test reçue. Les fixtures ne sont jamais présentées comme une réponse IA ni lues à voix haute.");
      return;
    }
    if (typeof detail.text !== "string" || !detail.text.trim()) return;
    lastAssistantText = detail.text;
    replayButton.disabled = !speechAvailable;
    if (enabled.checked) speak(lastAssistantText);
    else {
      controller.finishSpeech();
      render("Réponse live reçue. Active la voix pour l'écouter.");
    }
  });

  window.addEventListener("jx:assistant-request-start", () => {
    cancelSpeech();
    controller.beginThinking();
    render("JARVIS-X traite ta demande.");
  });

  window.addEventListener("pagehide", () => {
    stopRecognition();
    cancelSpeech();
    controller.stopAll();
  });

  const voiceSupported = speechAvailable;
  const micSupported = Boolean(recognitionConstructor);
  listenButton.disabled = !micSupported;
  enabled.disabled = !voiceSupported;
  if (!voiceSupported) status.textContent = "Synthèse vocale système indisponible. La voix de sortie nécessite un navigateur compatible.";
  else if (!micSupported) status.textContent = "Voix de sortie disponible. La reconnaissance vocale n'est pas exposée par ce navigateur : utilise la saisie clavier.";
  else status.textContent = "Voix système disponible. Microphone désactivé jusqu'à ton clic. Barge-in disponible lorsque le navigateur permet l'écoute pendant la lecture.";
  render();
})();
