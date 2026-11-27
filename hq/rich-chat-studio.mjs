/**
 * Rich Chat Studio: presentation and interaction layer for the on-device chat.
 * It never claims hidden reasoning, remote inference, or external tool execution.
 */
const $ = (id) => document.getElementById(id);
const localHeader = document.querySelector("main.local-chat-shell .brand");
const chatMain = document.querySelector(".jx-chat-main");
const transcript = $("transcript") || $("chat-thread");
const message = $("message") || $("chat-compose");
if ((!localHeader && !chatMain) || !transcript || !message) throw new Error("RichChatStudio requires a supported HQ chat surface.");

const state = { fontTheme: "editorial", persona: "architect", engine: "LOCAL WEBLLM · NOT LOADED", model: "UNKNOWN", backend: localHeader ? "LOCAL_WEBLLM" : "CLOUD_GATEWAY", stage: "IDLE" };
const root = document.createElement("section");
root.id = "rich-chat-studio";
root.className = "rcs-studio editorial";
root.setAttribute("aria-label", "Rich Chat Studio");
root.innerHTML = `
  <div class="rcs-topline">
    <span class="rcs-engine" id="rcs-engine" role="status" aria-live="polite">${localHeader ? "LOCAL WEBLLM · NOT LOADED" : "CLOUD GATEWAY · NOT VERIFIED"}</span>
    <span class="rcs-cloud" id="rcs-cloud">${localHeader ? "CLOUD INFERENCE · NOT CONFIGURED IN LOCAL CHAT" : "CLOUD GATEWAY · SIGN-IN REQUIRED"}</span>
    <span class="rcs-stage" id="rcs-stage">IDLE</span>
  </div>
  <div class="rcs-controls">
    <label>Style <select id="rcs-style"><option value="editorial">Éditorial clair</option><option value="hud-mono">HUD Mono</option><option value="cinema">Cinéma</option></select></label>
    <label>Persona <select id="rcs-persona"><option value="architect">Architecte visuel</option><option value="audit">Audit chirurgical</option><option value="coach">Coach terrain</option></select></label>
  </div>
  <div class="rcs-thinking" id="rcs-thinking" aria-live="polite"><span class="rcs-dot"></span><span id="rcs-thinking-label">Aucune génération en cours</span></div>
  <div class="rcs-selection">
    <button type="button" data-action="simplify">Simplifier</button>
    <button type="button" data-action="study">Mettre en fiche</button>
    <button type="button" data-action="clicky">Envoyer vers Clicky</button>
    <button type="button" data-action="storyboard">Créer storyboard</button>
  </div>
  <div class="rcs-storyboard" id="rcs-storyboard" aria-label="Storyboard visuel" hidden></div>
  <p class="rcs-note" id="rcs-note">${localHeader ? "Inférence locale WebLLM uniquement. Le Gateway mémoire n’est pas un moteur de réponse Cloud." : "Le statut Cloud est issu des événements réels de la session HQ. Une vérification de santé ne prouve pas à elle seule une génération."} Aucune recherche Web, génération d’image ou analyse PNG n’est lancée depuis ce studio.</p>
`;
if (localHeader) {
  const localStage = document.querySelector(".jx-chat-stage");
  if (!localStage) throw new Error("RichChatStudio could not find the local conversation stage.");
  localStage.insertBefore(root, transcript);
} else {
  chatMain.insertBefore(root, transcript);
}

function setStage(stage) {
  state.stage = String(stage || "IDLE");
  const pill = $("rcs-stage");
  const label = $("rcs-thinking-label");
  if (pill) pill.textContent = state.stage.toUpperCase();
  if (label) label.textContent = state.stage === "IDLE" ? "Aucune génération en cours" : state.stage;
  root.classList.toggle("is-thinking", state.stage !== "IDLE" && state.stage !== "READY" && state.stage !== "ERROR");
}
function setEngine(detail = {}) {
  if (typeof detail.status === "string") state.engine = detail.status;
  if (typeof detail.modelId === "string") state.model = detail.modelId;
  if (typeof detail.backend === "string") state.backend = detail.backend;
  const badge = $("rcs-engine");
  if (badge) badge.textContent = state.backend === "CLOUD_GATEWAY" ? state.engine : state.engine === "READY"
    ? "LOCAL WEBLLM · ACTIVE · " + state.model
    : "LOCAL WEBLLM · " + state.engine;
}
function personaPrompt() {
  const prompts = {
    architect: "Persona de présentation : architecte visuel. Structure la réponse avec étapes, relations et exemples concrets, sans prétendre générer des visuels.",
    audit: "Persona de présentation : audit chirurgical. Sépare faits observés, validations, hypothèses, inconnues, risques et tests nécessaires.",
    coach: "Persona de présentation : coach terrain. Donne des consignes pédagogiques, progressives et sûres, adaptées à un adolescent."
  };
  return prompts[state.persona];
}
function addStoryboardCard(title, content) {
  const board = $("rcs-storyboard");
  const card = document.createElement("article");
  card.className = "rcs-card";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const body = document.createElement("p");
  body.textContent = content;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copier";
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(content); copy.textContent = "Copié"; }
    catch { body.textContent = content + " (Sélectionne le texte pour le copier manuellement.)"; }
  });
  card.append(heading, body, copy);
  board.append(card);
  board.hidden = false;
}
$("rcs-style").addEventListener("change", (event) => {
  state.fontTheme = event.target.value;
  root.classList.remove("editorial", "hud-mono", "cinema");
  root.classList.add(state.fontTheme);
});
$("rcs-persona").addEventListener("change", (event) => { state.persona = event.target.value; });
root.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
  const selected = window.getSelection()?.toString().trim() || "";
  if (!selected) { setStage("Sélectionne d’abord un passage du cours ou de la réponse."); return; }
  const action = button.dataset.action;
  if (action === "storyboard") { addStoryboardCard("Étape du storyboard", selected); return; }
  const prompts = {
    simplify: "Explique ce passage simplement, avec un exemple :\n" + selected,
    study: "Transforme ce passage en fiche de révision structurée avec définitions et questions :\n" + selected,
    clicky: "Aide-moi à comprendre visuellement ce passage :\n" + selected
  };
  if (action === "clicky") window.dispatchEvent(new CustomEvent("jx:clicky-ask", { detail: { text: prompts.clicky } }));
  message.value = prompts[action] || selected;
  message.focus();
}));
window.addEventListener("jx:chat-engine", (event) => setEngine(event.detail || {}));
window.addEventListener("jx:gateway-state", (event) => {
  const detail = event.detail || {};
  const cloud = $("rcs-cloud");
  if (cloud) cloud.textContent = detail.ready
    ? detail.mode === "mock" ? "MOCK ROUTE READY · 0 MODEL CALLS" : "LIVE ROUTE READY · NO MODEL CALL YET"
    : "CLOUD GATEWAY · " + (detail.reason || "NOT VERIFIED");
  if (detail.ready && detail.mode === "live") setEngine({ backend: "CLOUD_GATEWAY", status: "CLOUD GATEWAY · AUTHENTICATED · LIVE ROUTE READY", modelId: detail.model || "MODEL NOT REPORTED" });
  if (!detail.ready) setEngine({ backend: "CLOUD_GATEWAY", status: "CLOUD GATEWAY · NOT VERIFIED", modelId: "UNKNOWN" });
});
window.addEventListener("jx:assistant-request-start", (event) => {
  const mode = event.detail?.mode;
  if (mode === "mock") {
    setEngine({ backend: "CLOUD_GATEWAY", status: "MOCK FIXTURE · NOT AI", modelId: "0 MODEL CALLS" });
    setStage("Exécution du fixture de test · aucun modèle");
  } else {
    setEngine({ backend: "CLOUD_GATEWAY", status: "CLOUD GATEWAY · REQUEST IN FLIGHT", modelId: "WAITING FOR SERVER RECEIPT" });
    setStage("Requête authentifiée envoyée au Gateway");
  }
});
window.addEventListener("jx:assistant-response", (event) => {
  if (event.detail?.mode === "mock") {
    setEngine({ backend: "CLOUD_GATEWAY", status: "MOCK FIXTURE · NOT AI", modelId: "0 MODEL CALLS" });
    setStage("Fixture reçu · aucune inférence");
  } else {
    setEngine({ backend: "CLOUD_GATEWAY", status: "CLOUD GATEWAY · RESPONSE RECEIVED", modelId: event.detail?.model || "MODEL NOT REPORTED" });
    setStage("Réponse Cloud reçue");
  }
});
window.addEventListener("jx:assistant-request-failed", () => {
  setEngine({ backend: "CLOUD_GATEWAY", status: "CLOUD GATEWAY · REQUEST FAILED", modelId: "UNKNOWN" });
  setStage("Échec de la requête · vérifier le reçu avant toute relance");
});
window.addEventListener("jx:chat-stage", (event) => setStage(event.detail?.stage || "IDLE"));
window.JXRichChatStudio = Object.freeze({ personaPrompt, getState: () => ({ ...state }) });
