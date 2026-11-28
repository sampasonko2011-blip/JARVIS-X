/**
 * Git du Futur: read-only evidence coverage. Forecasts abstain until calibration
 * evidence exists; no causal probabilities are fabricated from sparse schedules.
 */
const root = document.querySelector("#view-future");
const evidence = document.querySelector("#future-evidence");
const status = document.querySelector("#future-calibration-status");
const tag = document.querySelector("#future-calibration-tag");
const scenario = document.querySelector("#future-scenario");
const scenarioResult = document.querySelector("#future-scenario-result");
let latestPronoteSnapshot = null;

function readEvents() {
  try { return typeof window.jxReadCalendarEvents === "function" ? window.jxReadCalendarEvents() : []; }
  catch { return []; }
}
function refresh() {
  if (!root || !evidence) return;
  const events = readEvents();
  const school = events.filter(e => e.source === "pronote");
  const football = events.filter(e => e.source === "football");
  const bridgeEvents = Array.isArray(latestPronoteSnapshot?.events) ? latestPronoteSnapshot.events : [];
  const chargeEvents = events.filter(e => ["football_training", "football_match", "assessment", "homework"].includes(e.kind));
  const hours = events.reduce((sum, event) => {
    const duration = (Date.parse(event.end) - Date.parse(event.start)) / 3600000;
    return sum + (Number.isFinite(duration) && duration > 0 ? duration : 0);
  }, 0);
  const rows = [
    ["PRONOTE iCalendar events", school.length, school.length ? "OBSERVED · local import" : "MISSING"],
    ["PRONOTE bridge snapshot", bridgeEvents.length, bridgeEvents.length ? "OBSERVED · authenticated snapshot event" : "MISSING / NOT RECEIVED"],
    ["Football calendar events", football.length, football.length ? "OBSERVED · local import" : "MISSING"],
    ["Scheduled-load proxy", chargeEvents.length, chargeEvents.length ? "OBSERVED · calendar duration only" : "MISSING"],
    ["Actual training load / RPE / recovery history", "UNKNOWN", "MISSING · no load history exposed"],
    ["Scheduled hours across imported calendars", hours.toFixed(1) + " h", events.length ? "DESCRIPTIVE · not physiological load" : "MISSING"],
    ["Labeled historical outcomes", "UNKNOWN", "MISSING · no outcome dataset exposed"],
    ["Held-out calibration set", "UNKNOWN", "MISSING · no validation split exposed"]
  ];
  evidence.replaceChildren();
  for (const [label, value, state] of rows) {
    const item = document.createElement("div");
    item.className = "log";
    const strong = document.createElement("strong");
    strong.textContent = label + ": " + value;
    const small = document.createElement("small");
    small.textContent = state;
    item.append(strong, small);
    evidence.append(item);
  }
  tag.textContent = "UNAVAILABLE · NO CALIBRATION";
  status.textContent = "Aucune probabilité causale n’est publiée. Les calendriers donnent des événements planifiés, pas des résultats historiques ni une mesure réelle de charge. Les données manquantes restent UNKNOWN, jamais 0.";
}
document.querySelector("#future-refresh")?.addEventListener("click", refresh);
document.querySelector("#future-propose")?.addEventListener("click", () => {
  const text = scenario?.value.trim();
  if (!text) { scenarioResult.textContent = "Décris un scénario. Aucun changement n’a été effectué."; return; }
  scenarioResult.textContent = "PROPOSED · scénario local enregistré dans l’interface uniquement. Pas de simulation probabiliste, pas de branche Git créée, aucun agenda ni entraînement modifié. Toute future écriture exige une approbation L3 distincte.";
});
window.addEventListener("jx:pronote-snapshot", event => { latestPronoteSnapshot = event.detail?.snapshot || null; refresh(); });
window.addEventListener("jx:calendar-updated", refresh);
refresh();
