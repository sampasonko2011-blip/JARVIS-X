(() => {
  "use strict";
  const shell = document.querySelector("main.shell.local-chat-shell");
  const drawer = document.getElementById("jx-inspector-drawer");
  const toggle = document.getElementById("jx-toggle-inspector");
  if (!shell || !drawer || !toggle) return;

  // Move the original controls, preserving IDs, listeners, labels and form state.
  const model = shell.querySelector(":scope > .jx-model-rail");
  const controls = shell.querySelector(":scope > .jx-control-rail");
  if (model && model.parentElement !== drawer) drawer.appendChild(model);
  if (controls && controls.parentElement !== drawer) drawer.appendChild(controls);

  const setOpen = (open) => {
    drawer.hidden = !open;
    drawer.classList.toggle("is-open", open);
    toggle.classList.toggle("is-active", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  setOpen(false);
  toggle.addEventListener("click", () => setOpen(drawer.hidden));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
})();
