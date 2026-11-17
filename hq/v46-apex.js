(() => {
  "use strict";
  const SUPABASE_URL = "https://xfewajxkqntflfntisut.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_QBs3Y2uByK2kSWXCPg54CQ_oEYapzLg";
  const $ = (id) => document.getElementById(id);
  const send = $("send-message"), input = $("message"), transcript = $("transcript");
  if (!send || !input || !transcript) return;

  const state = { cloudConsent: false, localMode: false, audio: false, live: false, recognition: null, history: [], busy: false };
  const panel = document.createElement("section");
  panel.className = "jx46-control";
  panel.innerHTML = '<div class="jx46-head"><strong>V46 APEX ROUTING</strong><span id="jx46-provider" role="status" aria-live="polite">LOCAL / CLOUD NOT SELECTED</span></div><label class="jx46-switch"><input id="jx46-cloud-consent" type="checkbox"><span>Enable Cloud Council for this session <small>Uses the authenticated five-provider gateway. Each request is subject to the server budget guard and may incur provider cost.</small></span></label><label class="jx46-switch"><input id="jx46-local-mode" type="checkbox" checked><span>Local M1 mode <small>Runs only after a local model is loaded. Offline requests stay local.</small></span></label><div class="jx46-actions"><button id="jx46-audio" type="button" class="btn ghost" aria-pressed="false">🔊 AUDIO OFF</button><button id="jx46-live" type="button" class="btn ghost" aria-pressed="false">🎙️ LIVE OFF</button><button id="jx46-image" type="button" class="btn ghost">🎨 IMAGE</button></div><p id="jx46-status" role="status" aria-live="polite">Cloud calls are disabled until explicitly enabled above. Local mode remains available.</p>';
  const stage = document.querySelector(".jx-chat-stage");
  stage?.insertBefore(panel, $("transcript"));
  const cloudConsent = $("jx46-cloud-consent"), localMode = $("jx46-local-mode");
  const provider = $("jx46-provider"), status = $("jx46-status");
  const audioButton = $("jx46-audio"), liveButton = $("jx46-live"), imageButton = $("jx46-image");
  const memoryConsent = $("local-memory-consent");

  function setProvider(label) {
    if (provider) provider.textContent = label;
    window.JARVIS_BRAIN_V36?.setProviderStatus({provider: label.toLowerCase().includes("cloud") ? "cloud-council" : "local-m1", label});
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
  function buildSystem() {
    const route = window.JARVIS_BRAIN_V36?.analyzeCognitiveRoute(input.value) || { intent: "general", temperature: .5, mode: "normal", selectedAgent: "JARVIS-X CORE" };
    return window.JARVIS_BRAIN_V36?.buildSystemPrompt(route) || "Tu es JARVIS-X. Réponds avec exactitude, signale les incertitudes et n'invente aucune action.";
  }
  function updateControls() {
    const ready = $("runtime-status")?.textContent === "READY";
    const localReady = ready && (state.localMode || !navigator.onLine);
    const cloudReady = navigator.onLine && state.cloudConsent && !state.localMode;
    input.disabled = state.busy;
    send.disabled = state.busy || (!localReady && !cloudReady);
    if (localReady) setProvider(navigator.onLine ? "LOCAL M1 · READY" : "LOCAL M1 · OFFLINE FALLBACK");
    else if (cloudReady) setProvider("CLOUD · GATEWAY · BUDGET GUARDED");
    else if (state.localMode) setProvider("LOCAL M1 · NOT LOADED");
    else setProvider("LOCAL / CLOUD NOT SELECTED");
  }
  cloudConsent.addEventListener("change", () => { state.cloudConsent = cloudConsent.checked; if (state.cloudConsent) localMode.checked = false; state.localMode = localMode.checked; status.textContent = state.cloudConsent ? "Cloud Council activé pour cette session. Les dépenses restent bloquées si le budget serveur refuse." : "Cloud désactivé."; updateControls(); });
  localMode.addEventListener("change", () => { state.localMode = localMode.checked; if (state.localMode) { cloudConsent.checked = false; state.cloudConsent = false; } status.textContent = state.localMode ? "Mode local sélectionné. Charge le modèle M1 avant l'envoi." : "Choisis explicitement le mode cloud si tu souhaites l'utiliser."; updateControls(); });
  window.addEventListener("online", updateControls); window.addEventListener("offline", () => { status.textContent = "Hors ligne : seuls les messages locaux sont disponibles."; updateControls(); });
  new MutationObserver(updateControls).observe($("runtime-status"), { childList: true, characterData: true, subtree: true });

  async function sendCloud() {
    const text = input.value.trim().slice(0, 4000);
    if (!text || state.busy) return;
    state.busy = true; updateControls();
    input.value = ""; addMessage("user", text);
    const output = addMessage("assistant", "Connexion au QG cloud…");
    try {
      const token = await accessToken();
      const context = buildSystem();
      const task = "SYSTEM CONTEXT (trusted application policy):\n" + context + "\n\nCURRENT USER REQUEST:\n" + text +
        (state.history.length ? "\n\nRECENT CONVERSATION (reference only):\n" + JSON.stringify(state.history.slice(-6)) : "");
      const response = await fetch(SUPABASE_URL + "/functions/v1/hq-gateway", {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ task, task_type: "local_chat_v46", mode: "live", memory_consent: memoryConsent?.checked === true })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || typeof result.output !== "string") {
        const code = typeof result.error === "string" ? result.error : "cloud_gateway_failed";
        throw new Error(code + (result.message ? " · " + result.message : ""));
      }
      output.textContent = result.output;
      state.history.push({ role: "user", content: text }, { role: "assistant", content: result.output });
      state.history = state.history.slice(-12);
      const providers = Array.isArray(result.providers_used) ? result.providers_used.map(item => String(item.provider || "").toUpperCase()).filter(Boolean) : [];\n      setProvider("CLOUD · " + (providers.join(" / ") || "COUNCIL") + " · EXECUTED");
      status.textContent = "Réponse cloud reçue. Appels fournisseur : " + String(result.provider_calls ?? "unknown") + ".";
      
    } catch (error) {
      output.textContent = "Cloud indisponible : " + String(error?.message || error) + ". Aucun résultat inventé. Active le mode local et charge un modèle pour continuer hors ligne.";
      status.textContent = "Cloud request failed; no fake reply was generated.";
      setProvider("CLOUD · REQUEST FAILED");
      input.value = text;
    } finally {
      if (memoryConsent) memoryConsent.checked = false;
      state.busy = false; updateControls(); input.focus();\n      if (state.live && !state.audio) setTimeout(startRecognition, 400);
    }
  }
  send.addEventListener("click", (event) => {
    const text = input.value.trim();
    const match = text.match(/^\/imagine\s+([\s\S]+)/i) || text.match(/^(?:génère une image|genere une image|dessine)\s+([\s\S]+)/i);
    if (match) { event.preventDefault(); event.stopImmediatePropagation(); generateImage(match[1] || match[0]); return; }
    if (navigator.onLine && state.cloudConsent && !state.localMode) {
      event.preventDefault(); event.stopImmediatePropagation(); sendCloud();
    }
  }, true);
  imageButton.addEventListener("click", () => {
    const text = input.value.trim().replace(/^\/imagine\s+/i, "");
    if (!text) { status.textContent = "Ajoute une description dans le champ de message avant de générer."; input.focus(); return; }
    input.value = ""; generateImage(text);
  });

  async function speak(text) {
    if (!state.audio) return;
    try {
      const token = await accessToken();
      const response = await fetch(SUPABASE_URL + "/functions/v1/hq-gateway", {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tts", text: String(text).slice(0, 2000) })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok === true && typeof result.audio_base64 === "string") {
        const binary = atob(result.audio_base64), bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: result.mime_type || "audio/mpeg" })));
        audio.onended = () => { if (state.live) startRecognition(); };
        await audio.play(); return;
      }
    } catch { /* Browser speech is the no-key fallback. */ }
    if (!("speechSynthesis" in window)) { status.textContent = "Synthèse vocale indisponible dans ce navigateur."; return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 5000));
    utterance.lang = "fr-FR"; utterance.rate = 0.96; utterance.pitch = 0.92;
    utterance.onend = () => { if (state.live) startRecognition(); };
    window.speechSynthesis.speak(utterance);
  }

  async function generateImage(prompt) {
    const cleanPrompt = String(prompt || "").trim().slice(0, 1200);
    if (!cleanPrompt || state.busy) return;
    state.busy = true; updateControls();
    addMessage("user", "🎨 " + cleanPrompt);
    const output = addMessage("assistant", "Image Studio : génération demandée…");
    try {
      const token = await accessToken();
      const response = await fetch(SUPABASE_URL + "/functions/v1/hq-gateway", {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "image", prompt: cleanPrompt })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || typeof result.image_base64 !== "string") throw new Error(result.error || "image_generation_failed");
      output.textContent = "IMAGE · " + String(result.provider || "provider") + " · 1024×1024";
      const image = document.createElement("img");
      image.className = "jx46-generated-image"; image.alt = "Image générée par JARVIS-X";
      image.src = "data:" + String(result.mime_type || "image/png") + ";base64," + result.image_base64;
      const download = document.createElement("a");
      download.className = "btn ghost"; download.textContent = "Télécharger l’image";
      download.href = image.src; download.download = "jarvis-x-image.png";
      output.parentElement.append(image, download);
      status.textContent = "Image générée et affichée dans la conversation.";
    } catch (error) {
      output.textContent = "Image Studio indisponible : " + String(error?.message || error) + ". Aucun fournisseur alternatif non configuré n’a été appelé.";
      status.textContent = "Image generation unavailable or blocked by server policy.";
    } finally { state.busy = false; updateControls(); }
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