(() => {
  "use strict";
  const SUPABASE_URL = "https://xfewajxkqntflfntisut.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_QBs3Y2uByK2kSWXCPg54CQ_oEYapzLg";
  const GATEWAY = SUPABASE_URL + "/functions/v1/hq-gateway-v12";
  const $ = (id) => document.getElementById(id);
  const send = $("send-message"), input = $("message"), transcript = $("transcript");
  if (!send || !input || !transcript) return;

  const state = { cloudConsent: false, cloudAvailable: false, cloudChecking: false, imageAvailable: false, localMode: false, audio: false, live: false, recognition: null, history: [], busy: false };
  const panel = document.createElement("section");
  panel.className = "jx46-control";
  panel.innerHTML = '<div class="jx46-head"><strong>V46 APEX ROUTING</strong><span id="jx46-provider" role="status" aria-live="polite">LOCAL / CLOUD NOT SELECTED</span></div><label class="jx46-switch"><input id="jx46-cloud-consent" type="checkbox"><span>Enable HQ cloud route for this session <small>Checks the authenticated HQ v12 gateway first. Live inference remains unavailable while the server release lock is closed.</small></span></label><label class="jx46-switch"><input id="jx46-local-mode" type="checkbox" checked><span>Local M1 mode <small>Runs only after a local model is loaded. Offline requests stay local.</small></span></label><div class="jx46-actions"><button id="jx46-audio" type="button" class="btn ghost" aria-pressed="false">🔊 AUDIO OFF</button><button id="jx46-live" type="button" class="btn ghost" aria-pressed="false">🎙️ LIVE OFF</button><button id="jx46-image" type="button" class="btn ghost" disabled aria-disabled="true" title="Requires authenticated HQ v12 and the server image-generation flag">🎨 IMAGE · LOCKED</button></div><p id="jx46-status" role="status" aria-live="polite">Cloud calls are disabled until explicitly enabled above. Local mode remains available.</p>';
  const stage = document.querySelector(".jx-chat-stage");
  stage?.insertBefore(panel, $("transcript"));
  const cloudConsent = $("jx46-cloud-consent"), localMode = $("jx46-local-mode");
  const provider = $("jx46-provider"), status = $("jx46-status");
  const audioButton = $("jx46-audio"), liveButton = $("jx46-live"), imageButton = $("jx46-image");
  const memoryConsent = $("local-memory-consent");
  // The UI defaults to Local M1. Mirror that default into runtime state before the first control update.
  state.localMode = localMode.checked;

  function setProvider(label) {
    if (provider) provider.textContent = label;
    window.JARVIS_BRAIN_V36?.setProviderStatus({provider: label.toLowerCase().includes("cloud") ? "hq-gateway-v12" : "local-m1", label});
  }
  function addMessage(role, content, delivery) {
    const item = document.createElement("div"); item.className = "log";
    const title = document.createElement("strong"); title.textContent = role === "user" ? "YOU" : "JARVIS-X";
    const body = document.createElement("small"); body.textContent = content;
    item.append(title, body);
    if (delivery) { const meta = document.createElement("small"); meta.textContent = delivery; item.append(meta); }
    transcript.append(item); transcript.scrollTop = transcript.scrollHeight;
    return body;
  }
  function session() {
    try { return JSON.parse(sessionStorage.getItem("jx-auth-session") || "null"); } catch { return null; }
  }
  async function accessToken() {
    let s = session();
    if (!s || typeof s.access_token !== "string" || !s.refresh_token) throw new Error("Connecte-toi d'abord depuis HQ Chat dans ce même onglet.");
    const now = Math.floor(Date.now() / 1000);
    if (Number(s.expires_at) > now + 60) return s.access_token;
    const response = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!response.ok) { sessionStorage.removeItem("jx-auth-session"); throw new Error("Session expirée. Reconnecte-toi depuis HQ Chat."); }
    const next = await response.json();
    if (!next.access_token || !next.refresh_token) throw new Error("Session de connexion invalide.");
    s = { access_token: next.access_token, refresh_token: next.refresh_token, expires_at: Number(next.expires_at) || now + Number(next.expires_in || 3600) };
    sessionStorage.setItem("jx-auth-session", JSON.stringify(s));
    return s.access_token;
  }
  function buildSystem(userText = input.value) {
    const route = window.JARVIS_BRAIN_V36?.analyzeCognitiveRoute(userText) || { intent: "general", temperature: .5, mode: "normal", selectedAgent: "JARVIS-X CORE" };
    return window.JARVIS_BRAIN_V36?.buildSystemPrompt(route) || "Tu es JARVIS-X. Réponds avec exactitude, signale les incertitudes et n'invente aucune action.";
  }
  function updateControls() {
    const ready = $("runtime-status")?.textContent === "READY";
    const localReady = ready && (state.localMode || !navigator.onLine);
    const cloudSelected = navigator.onLine && state.cloudConsent && !state.localMode;
    const cloudReady = cloudSelected && state.cloudAvailable;
    const imageReady = cloudSelected && state.imageAvailable;
    imageButton.disabled = !imageReady || state.busy;
    imageButton.setAttribute("aria-disabled", String(imageButton.disabled));
    imageButton.textContent = imageReady ? "🎨 IMAGE · ACTIVE" : "🎨 IMAGE · LOCKED";
    input.disabled = state.busy || (!localReady && !cloudReady);
    send.disabled = state.busy || (!localReady && !cloudReady);
    if (localReady) setProvider(navigator.onLine ? "LOCAL M1 · READY" : "LOCAL M1 · OFFLINE FALLBACK");
    else if (cloudSelected && state.cloudChecking) setProvider("CLOUD · HQ V12 · CHECKING");
    else if (cloudReady) setProvider("CLOUD · HQ V12 · READY");
    else if (cloudSelected) setProvider("CLOUD · HQ V12 · LIVE LOCKED");
    else if (state.localMode) setProvider("LOCAL M1 · NOT LOADED");
    else setProvider("LOCAL / CLOUD NOT SELECTED");
  }
  async function checkCloudReadiness() {
    state.cloudAvailable = false;
    state.imageAvailable = false;
    if (!state.cloudConsent || state.localMode || !navigator.onLine) { state.cloudChecking = false; updateControls(); return; }
    state.cloudChecking = true; updateControls();
    status.textContent = "Vérification de l'état du gateway HQ v12…";
    try {
      const token = await accessToken();
      const healthUrl = GATEWAY + "/health?identity=jarvis-x&orchestration_mode=support";
      const response = await fetch(healthUrl, { method: "GET", cache: "no-store", headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + token, Accept: "application/json" } });
      const health = await response.json().catch(() => ({}));
      if (!response.ok || health.ok !== true || health.auth !== "verified-supabase-session") throw new Error(health.error || "gateway_health_unavailable");
      state.cloudAvailable = health.chatEnabled === true;
      state.imageAvailable = health.imageGenerationEnabled === true;
      if (state.cloudAvailable) status.textContent = "Gateway HQ v12 authentifié et prêt. Chaque requête reste soumise au contrôle serveur.";
      else {
        status.textContent = "Le verrou de release HQ v12 bloque l'inférence live (0 appel modèle). Aucune requête de chat ne sera envoyée. Passe en mode local.";
        setProvider("CLOUD · LIVE LOCKED · 0 MODEL CALLS");
      }
    } catch (error) {
      status.textContent = "État du gateway inconnu : " + String(error?.message || error) + ". Aucun envoi cloud ne sera tenté.";
      state.cloudAvailable = false;
      state.imageAvailable = false;
    } finally { state.cloudChecking = false; updateControls(); }
  }
  cloudConsent.addEventListener("change", () => {
    state.cloudConsent = cloudConsent.checked;
    state.cloudAvailable = false;
    if (state.cloudConsent) localMode.checked = false;
    state.localMode = localMode.checked;
    status.textContent = state.cloudConsent ? "Consentement cloud pour cette session. Vérification du gateway requise." : "Cloud désactivé.";
    updateControls();
    if (state.cloudConsent) checkCloudReadiness();
  });
  localMode.addEventListener("change", () => {
    state.localMode = localMode.checked;
    if (state.localMode) { cloudConsent.checked = false; state.cloudConsent = false; state.cloudAvailable = false; }
    status.textContent = state.localMode ? "Mode local sélectionné. Charge le modèle M1 avant l'envoi." : "Active explicitement le cloud pour vérifier le gateway HQ v12.";
    updateControls();
    if (state.cloudConsent) checkCloudReadiness();
  });
  window.addEventListener("online", () => { updateControls(); if (state.cloudConsent) checkCloudReadiness(); });
  window.addEventListener("offline", () => { state.cloudAvailable = false; status.textContent = "Hors ligne : seuls les messages locaux sont disponibles."; updateControls(); });
  new MutationObserver(updateControls).observe($("runtime-status"), { childList: true, characterData: true, subtree: true });


  async function sendImage(promptText) {
    const prompt = String(promptText || "").trim();
    if (!prompt || prompt.length > 4000 || state.busy || !state.imageAvailable || !state.cloudConsent || state.localMode) return;
    const approved = window.confirm("Générer cette image avec Nano Banana / Gemini ? Cette action utilise le budget image séparé du gateway JARVIS-X et sera enregistrée dans son audit.");
    if (!approved) return;
    state.busy = true; updateControls();
    addMessage("user", "/imagine " + prompt);
    const output = addMessage("assistant", "Image Studio · réservation du budget et génération sécurisée…");
    try {
      const token = await accessToken();
      const response = await fetch(GATEWAY + "/image", {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ prompt, aspect_ratio: "1:1", output_format: "png", user_confirmed: true, executive_identity: "jarvis-x", orchestration_mode: "support" })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || typeof result.image?.data_url !== "string" || !result.image.data_url.startsWith("data:image/")) throw new Error(result.error || "image_generation_failed");
      output.textContent = "Image créée par " + String(result.provider || "Nano Banana") + " · " + String(result.model || "Gemini") + ". Budget réservé : $" + String(result.budget?.reserved_usd ?? "inconnu");
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.className = "jx46-generated-image"; image.alt = "Image générée par JARVIS-X"; image.src = result.image.data_url;
      const download = document.createElement("a");
      download.className = "btn ghost"; download.textContent = "Télécharger l’image";
      download.href = result.image.data_url; download.download = "jarvis-x-image.png";
      figure.append(image, download); output.parentElement?.append(figure);
      setProvider("CLOUD · NANO BANANA · IMAGE GENERATED");
      status.textContent = "Image générée via le endpoint authentifié HQ v12. La réservation budgétaire et l'audit ont été appliqués.";
    } catch (error) {
      output.textContent = "Image Studio indisponible : " + String(error?.message || error) + ". Aucun fallback externe n'a été utilisé.";
      status.textContent = "Échec image ; vérifier le flag serveur, le secret Gemini et le budget image.";
    } finally { state.busy = false; updateControls(); }
  }

  async function sendCloud() {
    const text = input.value.trim();
    if (!text || state.busy) return;
    state.busy = true; updateControls();
    input.value = ""; addMessage("user", text);
    const output = addMessage("assistant", "Connexion au QG cloud…");
    try {
      const token = await accessToken();
      const context = buildSystem(text);
      const task = "SYSTEM CONTEXT (trusted application policy):\n" + context + "\n\nCURRENT USER REQUEST:\n" + text +
        (state.history.length ? "\n\nRECENT CONVERSATION (reference only):\n" + JSON.stringify(state.history.slice(-6).map(item => ({ role: item.role, content: String(item.content).slice(0, 400) }))) : "");
      const response = await fetch(GATEWAY, {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ task, task_type: "local_chat_v47", mode: "live", liveConsent: true, memory_consent: memoryConsent?.checked === true, executive_identity: "jarvis-x", orchestration_mode: "support" })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || typeof result.output !== "string") {
        const code = typeof result.error === "string" ? result.error : "cloud_gateway_failed";
        throw new Error(code + (result.message ? " · " + result.message : ""));
      }
      output.textContent = result.output;
      state.history.push({ role: "user", content: text }, { role: "assistant", content: result.output });
      state.history = state.history.slice(-12);
      setProvider("CLOUD · JARVIS-X · EXECUTED");
      status.textContent = "Réponse HQ v12 reçue. Appels modèle : " + String(result.model_calls ?? "unknown") + ". Mémoire : " + String(result.memory?.read_status || "unknown") + ".";
      
    } catch (error) {
      const failure = String(error?.message || error);
      output.textContent = "Cloud indisponible : " + failure + ". Aucun résultat inventé. Active le mode local et charge un modèle pour continuer.";
      if (failure.includes("live_inference_disabled")) {
        status.textContent = "Verrou de release HQ v12 actif : 0 appel modèle. L'inférence live n'est pas autorisée par la configuration serveur actuelle.";
        setProvider("CLOUD · LIVE LOCKED · 0 MODEL CALLS");
        state.cloudAvailable = false;
      } else {
        status.textContent = "Cloud request failed; no fake reply was generated.";
        setProvider("CLOUD · REQUEST FAILED");
      }
      input.value = text;
    } finally {
      if (memoryConsent) memoryConsent.checked = false;
      state.busy = false; updateControls(); input.focus();
      if (state.live && !state.audio) setTimeout(startRecognition, 400);
    }
  }
  send.addEventListener("click", (event) => {
    const text = input.value.trim();
    const match = text.match(/^\/imagine\s+([\s\S]+)/i) || text.match(/^(?:génère une image|genere une image|dessine)\s+([\s\S]+)/i);
    if (match) { event.preventDefault(); event.stopImmediatePropagation(); sendImage(match[1]); return; }
    if (navigator.onLine && state.cloudConsent && !state.localMode) {
      event.preventDefault(); event.stopImmediatePropagation(); sendCloud();
    }
  }, true);

  function speak(text) {
    if (!state.audio) return;
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") {
      status.textContent = "Synthèse vocale indisponible dans ce navigateur.";
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 5000));
    utterance.lang = "fr-FR"; utterance.rate = 0.96; utterance.pitch = 0.92;
    utterance.onend = () => { if (state.live) startRecognition(); };
    window.speechSynthesis.speak(utterance);
  }

  function startRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      state.live = false;
      liveButton.textContent = "🎙️ LIVE OFF";
      liveButton.setAttribute("aria-pressed", "false");
      status.textContent = "La reconnaissance vocale n'est pas prise en charge par ce navigateur.";
      return;
    }
    if (!state.live || state.busy) return;
    if (!state.recognition) {
      state.recognition = new Recognition();
      state.recognition.lang = "fr-FR"; state.recognition.continuous = true; state.recognition.interimResults = false;
      state.recognition.onresult = (event) => {
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) finalText += event.results[i][0].transcript + " ";
        if (finalText.trim()) { input.value = (input.value + " " + finalText.trim()).trim(); if (state.cloudConsent && !state.localMode) sendCloud(); else if ($("runtime-status")?.textContent === "READY") send.click(); else status.textContent = "Dictée reçue. Charge le modèle local avant l’envoi."; }
      };
      state.recognition.onerror = () => { status.textContent = "Reconnaissance vocale interrompue par le navigateur."; };
      state.recognition.onend = () => { if (state.live && !state.busy && !window.speechSynthesis?.speaking) setTimeout(startRecognition, 400); };
    }
    try { state.recognition.start(); } catch { /* already active */ }
  }
  imageButton.addEventListener("click", () => {
    if (!state.imageAvailable || !state.cloudConsent || state.localMode) return;
    const prompt = window.prompt("Décris l’image à générer (4 000 caractères maximum) :");
    if (prompt) sendImage(prompt);
  });
  audioButton.addEventListener("click", () => { state.audio = !state.audio; audioButton.textContent = state.audio ? "🔊 AUDIO ON" : "🔊 AUDIO OFF"; audioButton.setAttribute("aria-pressed", String(state.audio)); if (!state.audio) window.speechSynthesis?.cancel(); });
  liveButton.addEventListener("click", () => {
    state.live = !state.live; liveButton.textContent = state.live ? "🎙️ LIVE ON" : "🎙️ LIVE OFF"; liveButton.setAttribute("aria-pressed", String(state.live));
    if (state.live) { startRecognition(); status.textContent = "Écoute active. Le navigateur peut afficher une demande d'autorisation micro."; }
    else { state.recognition?.stop(); status.textContent = "Écoute arrêtée."; }
  });
  const auditTimers = new WeakMap();
  const observedAnswers = new WeakMap();
  new MutationObserver((records) => {
    for (const record of records) {
      const node = record.target.nodeType === 1 ? record.target.closest(".log") : record.target.parentElement?.closest(".log");
      if (!node) continue;
      const heading = node.querySelector("strong")?.textContent || "";
      if (!/JARVIS-X|assistant/i.test(heading)) continue;
      clearTimeout(auditTimers.get(node));
      auditTimers.set(node, setTimeout(() => {
        const answer = node.querySelector("small")?.textContent || "";
        if (!answer || answer.startsWith("Connexion au QG cloud")) return;
        if (state.audio && observedAnswers.get(node) !== answer) { observedAnswers.set(node, answer); speak(answer); }
        const previous = node.previousElementSibling;
        const task = previous?.querySelector("small")?.textContent || "";
        if (task && window.JARVIS_BRAIN_V36?.critiqueTurn) window.JARVIS_BRAIN_V36.critiqueTurn(task, answer);
      }, 1200));
    }
  }).observe(transcript, { childList: true, subtree: true, characterData: true });
  document.addEventListener("click", (event) => {
    if (event.target.closest("#load-model")) setTimeout(updateControls, 300);
  });
  updateControls();
})();