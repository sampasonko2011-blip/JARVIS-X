(() => {
  "use strict";
  const input = document.getElementById("message");
  const quickCommands = document.querySelector(".jx-slash-bar");
  if (input && quickCommands && input.parentElement) {
    input.parentElement.insertBefore(quickCommands, input);
  }
})();
