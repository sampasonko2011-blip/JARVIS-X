(() => {
  "use strict";
  const shell = document.querySelector(".shell");
  if (!shell || shell.dataset.spatialHudReady === "true") return;
  shell.dataset.spatialHudReady = "true";

  const $ = (selector) => document.querySelector(selector);
  const pillGateway = $("#jx-hud-gateway");
  const pillMemory = $("#jx-hud-memory");
  const pillRuntime = $("#jx-hud-runtime");
  const pillNetwork = $("#jx-hud-network");
  const pillActivity = $("#jx-hud-activity");
  const activityFill = $("#jx-hud-activity-fill");
  const viewLabel = $("#jx-canvas-context");
  const viewCount = $("#jx-canvas-view-count");
  const undoButton = $("#jx-dock-undo");
  const dockCount = $("#jx-dock-record-count");
  const activityEvents = [];
  let currentView = document.querySelector(".view:not(.hide)")?.id?.replace(/^view-/, "") || "overview";
  let previousView = null;
  let activityTimer = 0;

  const textOf = (selector, fallback = "UNKNOWN") => {
    const value = $(selector)?.textContent?.replace(/\s+/g, " ").trim();
    return value || fallback;
  };
  const activeView = () => document.querySelector(".nav [data-view].active")?.dataset.view
    || document.querySelector(".view:not(.hide)")?.id?.replace(/^view-/, "")
    || "overview";
  const domainFor = (view) => {
    if (["gateway", "audit"].includes(view)) return "security";
    if (["integrations", "sync", "memory"].includes(view)) return "academy";
    if (["workspace"].includes(view)) return "field";
    if (["console", "forge", "images"].includes(view)) return "architecture";
    return "architecture";
  };
  const titleFor = (view) => {
    const title = $("#page-title")?.textContent?.trim();
    return title || view.replace(/-/g, " ");
  };

  function render() {
    const view = activeView();
    shell.dataset.domain = domainFor(view);
    if (viewLabel) viewLabel.textContent = titleFor(view).toUpperCase();
    if (viewCount) viewCount.textContent = String(document.querySelectorAll(".view").length);
    if (pillGateway) pillGateway.textContent = textOf("#gateway-nav-state", "NOT CHECKED");
    if (pillRuntime) pillRuntime.textContent = textOf("#runtime-status", "SHELL ONLY");
    if (pillNetwork) pillNetwork.textContent = navigator.onLine ? "BROWSER LINK · ONLINE HINT" : "BROWSER LINK · OFFLINE HINT";
    if (pillMemory) pillMemory.textContent = "OAUTH · NOT CHECKED / LEGACY · NOT CHECKED";
    if (dockCount) dockCount.textContent = textOf("#data-count", "0") + " LOCAL RECORDS";
    if (undoButton) undoButton.disabled = !previousView || previousView === view;
  }

  function pulseActivity() {
    activityEvents.push(Date.now());
    while (activityEvents.length > 12) activityEvents.shift();
    if (pillActivity) pillActivity.dataset.active = "true";
    if (activityFill) activityFill.style.width = "100%";
    if (activityTimer) window.clearTimeout(activityTimer);
    activityTimer = window.setTimeout(() => {
      if (pillActivity) pillActivity.dataset.active = "false";
      if (activityFill) activityFill.style.width = "0";
    }, 900);
  }

  function navigate(view) {
    const button = document.querySelector('.nav [data-view="' + CSS.escape(view) + '"]');
    if (!button) return false;
    const from = activeView();
    if (from !== view) previousView = from;
    button.click();
    render();
    return true;
  }

  document.addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    pulseActivity();
    const target = event.target instanceof Element ? event.target.closest("[data-view], [data-go]") : null;
    if (target) {
      const next = target.dataset.view || target.dataset.go;
      const from = activeView();
      if (next && from !== next) previousView = from;
      window.requestAnimationFrame(render);
    }
  }, true);

  document.querySelectorAll("[data-jx-dock-view]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.jxDockView));
  });
  undoButton?.addEventListener("click", () => {
    if (!previousView) return;
    const destination = previousView;
    previousView = null;
    navigate(destination);
    render();
  });

  const watched = ["#gateway-nav-state", "#runtime-status", "#data-count", "#gateway-providers", "#gateway-result"];
  const observer = new MutationObserver(render);
  watched.map((selector) => $(selector)).filter(Boolean).forEach((node) => observer.observe(node, {
    childList: true, subtree: true, characterData: true, attributes: true,
  }));
  window.addEventListener("online", render, { passive: true });
  window.addEventListener("offline", render, { passive: true });
  document.querySelectorAll(".nav [data-view]").forEach((button) => {
    button.addEventListener("click", () => window.requestAnimationFrame(render));
  });
  render();
})();
