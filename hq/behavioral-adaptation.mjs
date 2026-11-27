import { assessBehavioralAdaptation } from "../dist/core/behavioral-engine.js";

const root = document.querySelector(".shell");
const status = document.querySelector("#jx-behavior-status");
const controls = [...document.querySelectorAll("[data-jx-user-state]")];
if (root && status && controls.length) {
  let explicitState = "normal";
  const deletionTimes = [];
  let latestWorkload = null;
  const render = () => {
    const now = Date.now();
    while (deletionTimes.length && now - deletionTimes[0] > 20 * 60_000) deletionTimes.shift();
    const workload = latestWorkload ? {
      importSource: latestWorkload.source,
      importedAt: latestWorkload.importedAt,
      academicDeadlinesNext24h: latestWorkload.academicDeadlinesNext24h,
      trainingSessionsNext24h: latestWorkload.trainingSessionsNext24h,
      latestTrainingEndHourLocal: latestWorkload.latestTrainingEndHourLocal
    } : {};
    const result = assessBehavioralAdaptation({
      explicitState,
      deletionEvents: deletionTimes.length,
      observationWindowMinutes: 20,
      ...workload
    });
    root.classList.toggle("jx-behavior-calm-stepwise", result.mode === "calm-stepwise");
    root.classList.toggle("jx-behavior-focused", result.mode === "focused");
    root.dataset.jxAdaptation = result.mode;
    const labels = {
      normal: "NORMAL",
      focused: "FOCUS · choix explicite",
      "calm-stepwise": "CALME · PAS À PAS"
    };
    const reasons = result.reasons.join(" · ");
    status.textContent = labels[result.mode] + (reasons ? " · " + reasons : " · aucun signal déclencheur");
    controls.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.jxUserState === explicitState)));
    window.__jxBehavioralContext = Object.freeze({ mode: result.mode, reasons: [...result.reasons], workloadEvidence: result.workloadEvidence });
    window.dispatchEvent(new CustomEvent("jx:behavior-adaptation", { detail: window.__jxBehavioralContext }));
  };
  controls.forEach(button => button.addEventListener("click", () => {
    explicitState = button.dataset.jxUserState;
    render();
  }));
  document.addEventListener("keydown", event => {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable)) return;
    deletionTimes.push(Date.now());
    render();
  }, true);
  window.addEventListener("jx:workload-snapshot", event => {
    const value = event.detail;
    if (!value || value.source !== "pronote+football-import" || typeof value.importedAt !== "string") {
      latestWorkload = null;
      render();
      return;
    }
    latestWorkload = {
      source: value.source,
      importedAt: value.importedAt,
      academicDeadlinesNext24h: Number.isInteger(value.academicDeadlinesNext24h) ? value.academicDeadlinesNext24h : undefined,
      trainingSessionsNext24h: Number.isInteger(value.trainingSessionsNext24h) ? value.trainingSessionsNext24h : undefined,
      latestTrainingEndHourLocal: Number.isFinite(value.latestTrainingEndHourLocal) ? value.latestTrainingEndHourLocal : undefined
    };
    render();
  });
  render();
}
