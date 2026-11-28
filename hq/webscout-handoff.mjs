/**
 * WebScout remains fail-closed until a real browsing capability is registered.
 * Smart Handoff prepares text locally; it never claims external execution.
 */
const query = document.querySelector("#webscout-query");
const brief = document.querySelector("#webscout-brief");
const status = document.querySelector("#webscout-status");
const payload = document.querySelector("#handoff-payload");
const handoffStatus = document.querySelector("#handoff-status");

document.querySelector("#webscout-check")?.addEventListener("click", () => {
  const tag = document.querySelector("#webscout-status-tag");
  tag.textContent = "BLOCKED · NO SEARCH TOOL";
  status.textContent = "OBSERVED in the current gateway capability registry: only the local read-only text.analyze capability is registered. No web search/browser capability is exposed, so WebScout cannot claim or attempt live research.";
});
document.querySelector("#webscout-prepare")?.addEventListener("click", () => {
  const q = query?.value.trim();
  if (!q) { status.textContent = "Ajoute une question avant de préparer le brief."; return; }
  brief.value = [
    "JARVIS-X / WEBSCOUT RESEARCH BRIEF",
    "Question: " + q,
    "Requirements: cite primary sources where possible; include publication dates; separate observed facts, inference and unknowns; cross-check key claims; report search scope and limitations.",
    "Output: concise synthesis, source title + URL + date + supporting claim, contradictions, confidence and unresolved gaps.",
    "Execution status: PREPARED LOCALLY ONLY. No search was executed."
  ].join("\n");
  status.textContent = "Brief préparé localement. Aucun résultat ni source n’a été inventé.";
});
document.querySelector("#webscout-copy")?.addEventListener("click", async () => {
  if (!brief?.value) { status.textContent = "Prépare d’abord le brief."; return; }
  try { await navigator.clipboard.writeText(brief.value); status.textContent = "Brief copié. Aucune recherche externe exécutée."; }
  catch { brief.focus(); brief.select(); status.textContent = "Presse-papiers indisponible ; brief sélectionné pour copie manuelle."; }
});
function inferHandoffIntent(task) {
  const value = task.toLocaleLowerCase("fr");
  if (/vidéo|video|clip|animation|storyboard|montage/.test(value)) return "video";
  if (/image|illustration|affiche|logo|visuel|dessin/.test(value)) return "image";
  if (/audio|voix|musique|son|narration/.test(value)) return "audio";
  if (/recherche|sources|étude|comparatif|actualité|documentation/.test(value)) return "research";
  if (/code|application|prototype|site web|bug|programmation/.test(value)) return "code";
  return "general";
}
const HANDOFF_CATEGORIES = Object.freeze({
  video: "video-generation capability",
  image: "image-generation or editing capability",
  audio: "audio-generation or speech capability",
  research: "web research or source-verification capability",
  code: "coding or prototyping capability",
  general: "general-purpose external capability"
});
document.querySelector("#handoff-prepare")?.addEventListener("click", () => {
  const task = document.querySelector("#handoff-task")?.value.trim();
  if (!task) { handoffStatus.textContent = "Décris le résultat attendu avant de préparer le handoff."; return; }
  const selected = document.querySelector("#handoff-intent")?.value || "auto";
  const intent = selected === "auto" ? inferHandoffIntent(task) : selected;
  payload.value = [
    "JARVIS-X SMART HANDOFF",
    "Intent: " + intent,
    "Target capability category: " + (HANDOFF_CATEGORIES[intent] || HANDOFF_CATEGORIES.general),
    "Objective: " + task,
    "Requirements: choose a compatible provider only after inspecting its real capability, input limits, privacy policy and cost; preserve user-supplied references; return the deliverable and an execution receipt.",
    "Provenance: payload prepared locally by HQ. No provider is registered, opened, invoked or executed."
  ].join("\n");
  handoffStatus.textContent = "Brief généraliste préparé localement (" + intent + "). Aucun fournisseur n’est enregistré ; aucune action externe n’a été lancée.";
});
document.querySelector("#handoff-copy")?.addEventListener("click", async () => {
  if (!payload?.value) { handoffStatus.textContent = "Prépare d’abord le payload."; return; }
  try { await navigator.clipboard.writeText(payload.value); handoffStatus.textContent = "Payload copié. L’outil externe n’a pas été exécuté."; }
  catch { payload.focus(); payload.select(); handoffStatus.textContent = "Presse-papiers indisponible ; payload sélectionné pour copie manuelle."; }
});
