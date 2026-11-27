export function assessBehavioralAdaptation(input = {}) {
  const reasons = [];
  const state = input.explicitState ?? "normal";
  if (state === "tired" || state === "stressed") reasons.push("user_selected_" + state);
  const frictionObserved = Number.isInteger(input.deletionEvents)
    && (input.deletionEvents ?? 0) >= 4
    && Number.isFinite(input.observationWindowMinutes)
    && (input.observationWindowMinutes ?? Infinity) <= 20;
  if (frictionObserved) reasons.push("repeated_deletion_interaction_observed");
  let workloadEvidence = "not-provided";
  const hasWorkload = input.academicDeadlinesNext24h !== undefined
    || input.trainingSessionsNext24h !== undefined
    || input.latestTrainingEndHourLocal !== undefined
    || input.importedAt !== undefined
    || input.importSource !== undefined;
  if (hasWorkload) {
    const importedTime = input.importedAt ? Date.parse(input.importedAt) : NaN;
    const fresh = input.importSource === "pronote+football-import"
      && Number.isFinite(importedTime)
      && importedTime <= Date.now() + 5 * 60_000
      && Date.now() - importedTime <= 24 * 60 * 60_000;
    if (!fresh) workloadEvidence = "stale-or-untrusted";
    else {
      workloadEvidence = "fresh-import";
      const deadlineCount = input.academicDeadlinesNext24h;
      const sessionCount = input.trainingSessionsNext24h;
      const lateTraining = Number.isFinite(input.latestTrainingEndHourLocal)
        && (input.latestTrainingEndHourLocal ?? 0) >= 19;
      if (Number.isInteger(deadlineCount) && Number.isInteger(sessionCount)
        && deadlineCount >= 1 && sessionCount >= 1 && lateTraining) {
        reasons.push("verified_deadline_and_late_training_overlap");
      }
    }
  }
  const calm = state === "tired" || state === "stressed"
    || frictionObserved || reasons.includes("verified_deadline_and_late_training_overlap");
  return {
    mode: calm ? "calm-stepwise" : state === "focus" ? "focused" : "normal",
    reasons,
    workloadEvidence
  };
}
