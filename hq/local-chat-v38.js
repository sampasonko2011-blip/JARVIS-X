(() => {
  "use strict";
  const drawer = document.getElementById("jx-inspector-drawer");
  const toggle = document.getElementById("jx-toggle-inspector");
  const input = document.getElementById("message");
  const button = document.getElementById("jx-return-to-chat");
  if (!drawer || !toggle || !input || !button) return;

  const syncVisibility = () => {
    const open = !drawer.hidden && drawer.classList.contains("is-open");
    button.hidden = !open;
    button.setAttribute("aria-hidden", String(!open));
  };

  button.addEventListener("click", () => {
    drawer.hidden = true;
    drawer.classList.remove("is-open");
    toggle.classList.remove("is-active");
    toggle.setAttribute("aria-expanded", "false");
    syncVisibility();

    // The actual composer in this version is #message (there is no
    // #jx-chat-input element). Scroll to that real target without fighting
    // the browser's scroll animation, then return keyboard focus safely.
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => input.focus({ preventScroll: true }), 250);
  });

  new MutationObserver(syncVisibility).observe(drawer, {
    attributes: true,
    attributeFilter: ["hidden", "class"]
  });
  syncVisibility();
})();
