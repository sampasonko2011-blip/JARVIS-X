/**
 * LOCK IN controller: view isolation + explicit global STOP.
 * STOP aborts only operations registered with the shared abort registry.
 */
const shell = document.querySelector(".shell");
const lockButton = document.querySelector("#jx-lock-in");
const stopButton = document.querySelector("#jx-stop");
const status = document.querySelector("#jx-lock-status");
let active = false;
let activeView = null;

const controllers = window.__jxAbortControllers instanceof Set ? window.__jxAbortControllers : new Set();
window.__jxAbortControllers = controllers;
window.jxRegisterAbortController = controller => {
  if (!(controller instanceof AbortController)) return () => {};
  controllers.add(controller);
  return () => controllers.delete(controller);
};
window.jxAbortAll = reason => {
  for (const controller of [...controllers]) {
    try { controller.abort(reason || "JX_STOP"); } catch {}
  }
  controllers.clear();
};

function visibleView() {
  return document.querySelector(".main > .view:not(.hide)");
}
function setMode(next) {
  active = Boolean(next);
  activeView = active ? visibleView()?.id || null : null;
  shell?.classList.toggle("jx-lock-in", active);
  lockButton?.setAttribute("aria-pressed", String(active));
  if (lockButton) lockButton.textContent = active ? "⚡ LOCKED IN" : "⚡ LOCK IN";
  if (status) status.textContent = active ? "LOCKED · VIEW ISOLATION · " + (activeView || "VIEW_UNKNOWN") : "NORMAL";
}
lockButton?.addEventListener("click", () => setMode(!active));
stopButton?.addEventListener("click", () => {
  window.jxAbortAll("JX_STOP");
  setMode(false);
  window.dispatchEvent(new CustomEvent("jx:stop", { detail: { reason: "user_stop" } }));
  if (status) status.textContent = "NORMAL · STOP acknowledged; registered operations aborted.";
});
document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view], [data-go]");
  if (active && nav) setMode(false);
}, true);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && active) setMode(false);
});
window.addEventListener("jx:stop", () => setMode(false));
