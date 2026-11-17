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
  panel.innerHTML = '<div class="jx46-head"><strong>V46 APEX ROUTING</strong><span id="jx46-provider" role="status" aria-live="polite">LOCAL / CLOUD NOT SELECTED</span></div><label class="jx46-switch"><input id="jx46-cloud-consent" type="checkbox"><span>Enable Cloud Council for this session <small>Uses the authenticated five-provider gateway. Each request is subject to the server budget guard and may incur provider cost.</small></span></label><label class="jx46-switch"><input id="jx46-local-mode" type="checkbox" checked><span>Local M1 mode <small>Runs only after a local model is loaded. Offline requests stay local.</small></span></label><div class="jx46-actions"><button id="jx46-audio" type="button" class="btn ghost" aria-pressed="false">🔊 AUDIO OFF</button><button id="jx46-live" type="button" class="btn ghost" aria-pressed="false">🎙️ LIVE OFF</button></div><p id="jx46-status" role="status" aria-live="polite">Cloud calls are disabled until explicitly enabled above. Local mode remains available.</p>';
  const stage = document.querySelector(".jx-chat-stage");
  stage?.insertBefore(panel, $("transcript"));
  const cloudConsent = $("jx46-cloud-consent"), localMode = $("jx46-local-mode");
  const provider = $("jx46-provider"), status = $("jx46-status");
  const audioButton = $("jx46-audio"), liveButton = $("jx46-live");
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
    const cloudReady = navigator.onLine && state.cloudConsent && !state.localMode;
    input.disabled = state.busy || (!ready && !cloudReady);
    send.disabled = state.busy || (!ready && !cloudReady);
    if (state.localMode) setProvider(ready ? "LOCAL M1 · READY" : "LOCAL M1 · NOT LOADED");
    else if (state.cloudConsent && navigator.onLine) setProvider("CLOUD · GATEWAY · BUDGET GUARDED");
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
      setProvider("CLOUD · FIVE-PROVIDER COUNCIL · EXECUTED");
      status.textContent = "Réponse cloud reçue. Appels fournisseur : " + String(result.provider_calls ?? "unknown") + ".";
      
    } catch (error) {
      output.textContent = "Cloud indisponible : " + String(error?.message || error) + ". Aucun résultat inventé. Active le mode local et charge un modèle pour continuer hors ligne.";
      status.textContent = "Cloud request failed; no fake reply was generated.";
      setProvider("CLOUD · REQUEST FAILED");
      input.value = text;
    } finally {
      if (memoryConsent) memoryConsent.checked = false;
      state.busy = false; updateControls(); input.focus();
    }
  }
  send.addEventListener("click", (event) => {
    if (navigator.onLine && state.cloudConsent && !state.localMode) {
      event.preventDefault(); event.stopImmediatePropagation(); sendCloud();
    }
  }, true);

  function speak(text) {
    if (!("speechSynthesis" in window) || !state.audio) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 5000));
    utterance.lang = "fr-FR"; utterance.rate = 0.96; utterance.pitch = 0.92;
    utterance.onend = () => { if (state.live) startRecognition(); };
    window.speechSynthesis.speak(utterance);
  }
  function startRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition || !state.live || state.busy) return;
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
  const spoken = new WeakSet();\n  new MutationObserver((records) => {\n    if (!state.audio) return;\n    for (const record of records) for (const node of record.addedNodes) {\n      if (node.nodeType !== 1 || !node.classList.contains("log") || spoken.has(node)) continue;\n      const heading = node.querySelector("strong")?.textContent || "";\n      const text = node.querySelector("small")?.textContent || "";\n      if (/JARVIS-X|assistant/i.test(heading) && text) { spoken.add(node); speak(text); }\n    }\n  }).observe(transcript, { childList: true });\n  document.addEventListener("click", (event) => {
    if (event.target.closest("#load-model")) setTimeout(updateControls, 300);
  });
  updateControls();
})();