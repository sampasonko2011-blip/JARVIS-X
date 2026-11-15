/* JARVIS-X v36 local-first cognitive router.
 * Deterministic routing only: this module does not invoke external agents or services.
 */
(() => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function route(input) {
    const text = String(input || "").slice(0, 4000);
    const normalized = text.toLowerCase();
    let intent = "general";
    let temperature = 0.65;

    if (/\b(code|debug|function|javascript|typescript|python|sql|compile|test|ci)\b/.test(normalized)) {
      intent = "engineering";
      temperature = 0.25;
    } else if (/\b(research|source|citation|latest|compare|evidence|analyse|analyze)\b/.test(normalized)) {
      intent = "research";
      temperature = 0.35;
    } else if (/\b(plan|strategy|roadmap|priorit|architecture|design)\b/.test(normalized)) {
      intent = "strategy";
      temperature = 0.45;
    } else if (/\b(write|draft|story|creative|brainstorm)\b/.test(normalized)) {
      intent = "creative";
      temperature = 0.8;
    }

    let mode = "balanced";
    try {
      const saved = window.localStorage.getItem("jarvis_x_active_mode");
      if (["mode-sun", "mode-moon", "mode-cosmic"].includes(saved)) mode = saved;
    } catch { /* Storage can be unavailable; balanced remains safe. */ }

    return {
      intent,
      temperature: clamp(temperature, 0.1, 1.0),
      mode,
      selectedAgent: "jarvis-x-executive",
      execution: "local-model-only"
    };
  }

  function systemContext(selection) {
    return [
      "LOCAL COGNITIVE ROUTE (deterministic hint, not an external agent):",
      "Intent: " + selection.intent,
      "Mode: " + selection.mode,
      "Execution: local model only; no external model or tool was invoked.",
      "Treat this route as a suggestion. Follow the user's actual request and system safety rules."
    ].join("\n");
  }

  function record(selection, result) {
    return {
      intent: selection.intent,
      temperature: selection.temperature,
      status: String(result?.status || "unknown"),
      execution: "local-model-only"
    };
  }

  window.JARVIS_BRAIN_V36 = Object.freeze({ route, systemContext, record });
})();
