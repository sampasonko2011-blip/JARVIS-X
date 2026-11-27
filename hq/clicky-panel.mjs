/**
 * Clicky companion panel — local UI, optional HQ gateway bridge.
 * The overlay is a separate canvas and never intercepts pointer input.
 */
export class ClickyCompanionPanel {
  constructor({ overlayCanvas, chatLog, voiceController, askBrain, input, status }) {
    this.overlayCanvas = overlayCanvas;
    this.ctx = overlayCanvas?.getContext("2d") || null;
    this.chatLog = chatLog;
    this.voiceController = voiceController;
    this.askBrain = askBrain;
    this.input = input;
    this.status = status;
    this.active = false;
    this.busy = false;
    this.markers = [];
    this.guidanceMarkers = [];
    this.stepIndex = 0;
    this.pointerMode = "autonomous";
    this.activePointer = null;
    this.guidanceTimer = null;
    this.onCanvasPointerMove = event => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const rect = this.resizeTarget?.getBoundingClientRect();
      if (!rect) return;
      this.pointerMode = "assisted";
      this.activePointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.renderGuidanceStep();
    };
    this.onCanvasPointerDown = event => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      this.pointerMode = "assisted";
      if (this.markers.length) {
        this.stepIndex = Math.min(this.stepIndex + 1, this.guidanceMarkers.length - 1);
        this.renderGuidanceStep();
      }
    };
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.resizeOverlay()) : null;
    const target = document.querySelector("#p4-canvas");
    const canvasHost = document.querySelector("#clicky-canvas-host");
    if (target && canvasHost && target.parentElement?.classList.contains("p4-panel")) {
      canvasHost.replaceChildren(target.parentElement);
    }
    if (target && overlayCanvas) {
      const host = target.parentElement;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.appendChild(overlayCanvas);
      this.resizeObserver?.observe(target);
      this.resizeTarget = target;
      target.addEventListener("pointermove", this.onCanvasPointerMove, { passive: true });
      target.addEventListener("pointerdown", this.onCanvasPointerDown, { passive: true });
      this.resizeOverlay();
    }
  }

  resizeOverlay() {
    const target = this.resizeTarget;
    if (!target || !this.overlayCanvas) return;
    const rect = target.getBoundingClientRect();
    const hostRect = this.overlayCanvas.parentElement.getBoundingClientRect();
    this.overlayCanvas.style.position = "absolute";
    this.overlayCanvas.style.left = (rect.left - hostRect.left) + "px";
    this.overlayCanvas.style.top = (rect.top - hostRect.top) + "px";
    this.overlayCanvas.style.width = rect.width + "px";
    this.overlayCanvas.style.height = rect.height + "px";
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    this.overlayCanvas.width = Math.round(rect.width * ratio);
    this.overlayCanvas.height = Math.round(rect.height * ratio);
    this.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.guidanceMarkers.length) this.renderGuidanceStep();
    else this.renderVisualPointers(this.markers);
  }

  toggle(state = !this.active) {
    this.active = Boolean(state);
    this.overlayCanvas?.classList.toggle("is-active", this.active);
    if (!this.active) this.clearHighlights();
    if (this.status) this.status.textContent = this.active
      ? "Clicky activé. Le guidage est limité au canvas HQ intégré."
      : "Clicky désactivé.";
    return this.active;
  }

  clearHighlights() {
    if (!this.ctx || !this.overlayCanvas) return;
    this.ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.markers = [];
    this.guidanceMarkers = [];
    this.stopGuidance();
  }

  renderVisualPointers(markers = []) {
    if (!this.active || !this.ctx || !this.overlayCanvas) return;
    this.guidanceMarkers = Array.isArray(markers) ? markers.filter(m =>
      m && ["circle", "arrow"].includes(m.type) &&
      [m.x, m.y, m.r, m.fromX, m.fromY, m.toX, m.toY]
        .filter(v => v !== undefined).every(Number.isFinite)
    ).slice(0, 24) : [];
    const width = this.overlayCanvas.clientWidth;
    const height = this.overlayCanvas.clientHeight;
    const scaleX = width / 1000;
    const scaleY = height / 440;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.save();
    this.ctx.strokeStyle = "#38bdf8";
    this.ctx.fillStyle = "#38bdf8";
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = "rgba(56, 189, 248, .8)";
    this.ctx.shadowBlur = 12;
    for (const m of this.markers) {
      this.ctx.beginPath();
      if (m.type === "circle") {
        this.ctx.arc(m.x * scaleX, m.y * scaleY, Math.max(4, Math.min(120, (m.r || 28) * Math.min(scaleX, scaleY))), 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        this.ctx.moveTo(m.fromX * scaleX, m.fromY * scaleY);
        this.ctx.lineTo(m.toX * scaleX, m.toY * scaleY);
        this.ctx.stroke();
        const toX = m.toX * scaleX, toY = m.toY * scaleY;
        const angle = Math.atan2(m.toY - m.fromY, m.toX - m.fromX);
        this.ctx.beginPath();
        this.ctx.moveTo(toX, toY);
        this.ctx.lineTo(toX - 12 * Math.cos(angle - Math.PI / 6), toY - 12 * Math.sin(angle - Math.PI / 6));
        this.ctx.lineTo(toX - 12 * Math.cos(angle + Math.PI / 6), toY - 12 * Math.sin(angle + Math.PI / 6));
        this.ctx.closePath();
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }

  stopGuidance() {
    if (this.guidanceTimer !== null) clearInterval(this.guidanceTimer);
    this.guidanceTimer = null;
  }

  renderGuidanceStep() {
    if (!this.active || !this.ctx || !this.overlayCanvas || !this.guidanceMarkers.length) return;
    const current = this.guidanceMarkers[this.stepIndex];
    this.renderVisualPointers([current]);
    const width = this.overlayCanvas.clientWidth;
    const height = this.overlayCanvas.clientHeight;
    const scaleX = width / 1000, scaleY = height / 440;
    let x, y;
    if (this.pointerMode === "assisted" && this.activePointer) {
      x = this.activePointer.x + 24;
      y = this.activePointer.y + 24;
    } else {
      x = current.type === "circle" ? current.x * scaleX : current.toX * scaleX;
      y = current.type === "circle" ? current.y * scaleY : current.toY * scaleY;
    }
    x = Math.max(14, Math.min(width - 14, x));
    y = Math.max(14, Math.min(height - 14, y));
    this.ctx.save();
    this.ctx.fillStyle = "#f8fafc";
    this.ctx.strokeStyle = "#38bdf8";
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = "rgba(56,189,248,.95)";
    this.ctx.shadowBlur = 16;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x - 15, y + 25);
    this.ctx.lineTo(x - 4, y + 22);
    this.ctx.lineTo(x + 2, y + 32);
    this.ctx.lineTo(x + 8, y + 28);
    this.ctx.lineTo(x + 2, y + 18);
    this.ctx.lineTo(x + 12, y + 15);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
    if (this.status) this.status.textContent = (this.pointerMode === "assisted" ? "Mode pas-à-pas — " : "Mode autonome — ") + "étape " + (this.stepIndex + 1) + "/" + this.guidanceMarkers.length;
  }

  startGuidance(markers) {
    this.stopGuidance();
    this.markers = Array.isArray(markers) ? markers.filter(m =>
      m && ["circle", "arrow"].includes(m.type) &&
      [m.x, m.y, m.r, m.fromX, m.fromY, m.toX, m.toY]
        .filter(v => v !== undefined).every(Number.isFinite)
    ).slice(0, 24) : [];
    this.stepIndex = 0;
    if (!this.guidanceMarkers.length) { this.clearHighlights(); return; }
    this.renderGuidanceStep();
    if (this.pointerMode === "autonomous" && this.guidanceMarkers.length > 1) {
      this.guidanceTimer = setInterval(() => {
        if (this.pointerMode !== "autonomous") { this.stopGuidance(); return; }
        if (this.stepIndex >= this.guidanceMarkers.length - 1) { this.stopGuidance(); return; }
        this.stepIndex += 1;
        this.renderGuidanceStep();
      }, 2400);
    }
  }

  append(role, message) {
    if (!this.chatLog) return;
    const item = document.createElement("div");
    item.className = "clicky-message";
    const heading = document.createElement("strong");
    heading.textContent = role;
    const body = document.createElement("p");
    body.textContent = String(message || "");
    item.append(heading, body);
    this.chatLog.append(item);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  async askClicky({ text, canvasSnapshotPng = null, speak = false }) {
    if (!this.active) return { status: "CLICKY_INACTIVE" };
    if (this.busy) return { status: "CLICKY_BUSY" };
    if (!text?.trim()) return { status: "EMPTY_PROMPT" };
    if (typeof this.askBrain !== "function") {
      return { status: "BRAIN_NOT_CONNECTED", explanation: "Le pont vers le moteur JARVIS-X n'est pas disponible." };
    }
    this.busy = true;
    this.append("TOI", text);
    if (this.status) this.status.textContent = "Demande envoyée au moteur HQ…";
    try {
      const reply = await this.askBrain({ prompt: text, imagePng: canvasSnapshotPng });
      if (Array.isArray(reply?.markers)) this.startGuidance(reply.markers);
      const explanation = String(reply?.explanation || reply?.output || "Aucune explication exploitable reçue.");
      this.append("CLICKY / JARVIS-X", explanation);
      if (speak && this.voiceController) await this.voiceController.speak(explanation);
      if (this.status) this.status.textContent = reply?.status || "Réponse reçue.";
      return reply;
    } catch (error) {
      const explanation = "Échec de la demande : " + String(error?.message || error);
      this.append("SYSTÈME", explanation);
      if (this.status) this.status.textContent = explanation;
      return { status: "CLICKY_ERROR", explanation };
    } finally {
      this.busy = false;
    }
  }

  destroy() {
    this.stopGuidance();
    this.resizeObserver?.disconnect();
    this.resizeTarget?.removeEventListener("pointermove", this.onCanvasPointerMove);
    this.resizeTarget?.removeEventListener("pointerdown", this.onCanvasPointerDown);
    this.clearHighlights();
    this.overlayCanvas?.remove();
  }
}

class ClickyVoiceController {
  constructor(status) { this.status = status; this.recognition = null; }
  speak(text) {
    if (!("speechSynthesis" in window)) throw new Error("Synthèse vocale indisponible.");
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = resolve;
      utterance.onerror = resolve;
      speechSynthesis.speak(utterance);
    });
  }
  listen(onText) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) throw new Error("SpeechRecognition n'est pas pris en charge par ce navigateur.");
    this.recognition?.stop();
    const recognition = new Recognition();
    recognition.lang = "fr-FR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => onText(event.results?.[0]?.[0]?.transcript || "");
    recognition.onerror = event => { if (this.status) this.status.textContent = "Micro : " + event.error; };
    recognition.onend = () => { if (this.status) this.status.textContent = "Micro arrêté."; };
    this.recognition = recognition;
    recognition.start();
  }
  stop() { this.recognition?.stop(); this.recognition = null; }
}

const status = document.querySelector("#clicky-status");
const voice = new ClickyVoiceController(status);
const overlay = document.createElement("canvas");
overlay.className = "clicky-overlay";
overlay.setAttribute("aria-hidden", "true");
const panel = new ClickyCompanionPanel({
  overlayCanvas: overlay,
  chatLog: document.querySelector("#clicky-log"),
  voiceController: voice,
  input: document.querySelector("#clicky-input"),
  status,
  askBrain: async ({ prompt }) => {
    const input = document.querySelector("#chat-compose");
    const send = document.querySelector("#chat-send");
    if (!input || !send) throw new Error("Le chat HQ n'est pas disponible.");
    if (!document.querySelector("#clicky-live-consent")?.checked) throw new Error("Autorise d’abord explicitement la requête live HQ. Aucun appel n’a été envoyé.");
    if (document.querySelector("#chat-execution-mode")?.value !== "live") throw new Error("Le mode mock n’est pas une réponse IA. Sélectionne live après avoir vérifié le budget.");
    if (send.disabled) throw new Error("La passerelle de chat HQ n'est pas prête ou la session n'est pas authentifiée.");
    const request = "Réponds en français à la demande suivante. Si un guidage visuel est pertinent, termine par un bloc JSON strict {\"markers\":[{\"type\":\"circle\",\"x\":100,\"y\":100,\"r\":28}]} avec coordonnées relatives à un canvas de référence 1000 × 440. Le canvas n’est pas transmis au moteur : base les coordonnées uniquement sur la description fournie et annonce cette limite. Sinon réponds sans bloc. Demande : " + prompt;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener("jx:assistant-response", onResponse);
        window.removeEventListener("jx:assistant-request-failed", onFailure);
        clearTimeout(timer);
      };
      const finish = (fn, value) => { if (settled) return; settled = true; cleanup(); fn(value); };
      const onResponse = event => {
        const raw = String(event.detail?.text || "");
        let markers = [];
        const match = raw.match(/\{\s*"markers"\s*:[\s\S]*?\}\s*$/);
        let explanation = raw;
        if (match) {
          try { const parsed = JSON.parse(match[0]); markers = Array.isArray(parsed.markers) ? parsed.markers : []; explanation = raw.slice(0, match.index).trim(); } catch {}
        }
        finish(resolve, { status: "RESPONSE_RECEIVED", explanation, markers });
      };
      const onFailure = () => finish(reject, new Error("La requête HQ a échoué. Consulte le statut du chat."));
      const timer = setTimeout(() => finish(reject, new Error("Délai dépassé : état de livraison à vérifier dans le chat HQ.")), 105000);
      window.addEventListener("jx:assistant-response", onResponse, { once: true });
      window.addEventListener("jx:assistant-request-failed", onFailure, { once: true });
      input.value = request;
      send.click();
    });
  }
});

document.querySelector("#clicky-enable")?.addEventListener("click", () => {
  const active = panel.toggle();
  document.querySelector("#clicky-enable").textContent = active ? "Désactiver Clicky" : "Activer Clicky";
});
document.querySelector("#clicky-clear")?.addEventListener("click", () => panel.clearHighlights());
document.querySelector("#clicky-send")?.addEventListener("click", async () => {
  const input = document.querySelector("#clicky-input");
  const snapshotCanvas = document.querySelector("#p4-canvas");
  let snapshot = null;
  if (snapshotCanvas && snapshotCanvas.width && snapshotCanvas.height) {
    try { snapshot = snapshotCanvas.toDataURL("image/png"); } catch {}
  }
  await panel.askClicky({ text: input.value, canvasSnapshotPng: snapshot, speak: document.querySelector("#clicky-speak-reply")?.checked === true });
  input.value = "";
});
document.querySelector("#clicky-input")?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); document.querySelector("#clicky-send")?.click(); }
});
document.querySelector("#clicky-voice")?.addEventListener("click", () => {
  try { voice.listen(text => { document.querySelector("#clicky-input").value = text; }); }
  catch (error) { if (status) status.textContent = error.message; }
});
document.querySelector("#clicky-stop-voice")?.addEventListener("click", () => voice.stop());
document.querySelector("#clicky-open-canvas")?.addEventListener("click", () => {
  document.querySelector("#p4-canvas")?.scrollIntoView({ behavior: "smooth", block: "center" });
  status.textContent = "Canvas intégré au workspace. Le calque Clicky suit sa taille et reste non interactif.";
});
window.addEventListener("resize", () => panel.resizeOverlay());
window.addEventListener("scroll", () => panel.resizeOverlay(), true);
