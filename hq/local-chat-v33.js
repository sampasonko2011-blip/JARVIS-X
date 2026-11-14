(() => {
  "use strict";

  const STORE = {
    mode: "jarvis_x_active_mode",
    vault: "jarvis_x_local_vault_v33"
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const safeRead = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  };
  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  };

  const modeClass = (value) => {
    const mode = ["normal", "focus", "sun"].includes(value) ? value : "normal";
    document.body.classList.remove("mode-normal", "mode-focus", "mode-sun");
    document.body.classList.add("mode-" + mode);
    return mode;
  };
  let mode = modeClass((() => {
    try { return localStorage.getItem(STORE.mode) || "normal"; }
    catch (_) { return "normal"; }
  })());

  const canvas = $("#jx-chat-cosmos");
  const context = canvas && canvas.getContext ? canvas.getContext("2d", { alpha: true }) : null;
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let frame = 0;
  let lastFrame = 0;
  const nodes = [];
  const pulses = [];
  const NODE_COUNT = 38;

  function resizeCanvas() {
    if (!canvas || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!nodes.length) {
      for (let i = 0; i < NODE_COUNT; i += 1) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          radius: 0.7 + Math.random() * 1.1,
          gold: i % 4 === 0
        });
      }
    } else {
      nodes.forEach((node) => {
        node.x = Math.min(node.x, width);
        node.y = Math.min(node.y, height);
      });
    }
    draw(0);
  }

  function pulseAt(x, y) {
    nodes.forEach((node) => {
      const dx = node.x - x;
      const dy = node.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1 && distance < 170) {
        const force = (1 - distance / 170) * 1.25;
        node.vx += (dx / distance) * force;
        node.vy += (dy / distance) * force;
      }
    });
    pulses.push({ x, y, radius: 4, life: 0.75 });
    if (pulses.length > 12) pulses.shift();
  }

  function draw(delta) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const sun = mode === "sun";
    const primary = sun ? "255, 91, 66" : "101, 243, 225";
    const secondary = sun ? "255, 185, 105" : "156, 131, 255";
    nodes.forEach((node, index) => {
      if (delta > 0) {
        node.x += node.vx * delta;
        node.y += node.vy * delta;
        node.vx *= 0.985;
        node.vy *= 0.985;
        if (node.x < 0) node.x = width;
        if (node.x > width) node.x = 0;
        if (node.y < 0) node.y = height;
        if (node.y > height) node.y = 0;
      }
      context.beginPath();
      context.fillStyle = "rgba(" + (node.gold ? secondary : primary) + ",.68)";
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      context.fill();
      for (let j = index + 1; j < nodes.length; j += 1) {
        const other = nodes[j];
        const distance = Math.hypot(node.x - other.x, node.y - other.y);
        if (distance < 105) {
          context.beginPath();
          context.strokeStyle = "rgba(" + primary + "," + ((1 - distance / 105) * 0.13) + ")";
          context.lineWidth = 0.65;
          context.moveTo(node.x, node.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }
      }
    });
    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i];
      pulse.radius += delta * 0.045;
      pulse.life -= delta * 0.00055;
      context.beginPath();
      context.strokeStyle = "rgba(" + primary + "," + Math.max(0, pulse.life * 0.35) + ")";
      context.lineWidth = 1;
      context.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      context.stroke();
      if (pulse.life <= 0) pulses.splice(i, 1);
    }
  }

  function animate(timestamp) {
    frame = 0;
    if (document.hidden || reducedMotion) return;
    if (lastFrame) draw(Math.min(34, timestamp - lastFrame));
    lastFrame = timestamp;
    frame = window.requestAnimationFrame(animate);
  }
  function startAnimation() {
    if (!reducedMotion && !document.hidden && !frame) {
      lastFrame = 0;
      frame = window.requestAnimationFrame(animate);
    }
  }
  function stopAnimation() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }
  resizeCanvas();
  startAnimation();
  window.addEventListener("resize", resizeCanvas, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAnimation();
    else startAnimation();
  });

  let lastPointerAt = 0;
  document.addEventListener("pointerdown", (event) => {
    const now = Date.now();
    if (now - lastPointerAt < 90) return;
    lastPointerAt = now;
    pulseAt(event.clientX, event.clientY);
    if (reducedMotion) draw(0);
    else startAnimation();
  }, { passive: true });

  const vaultList = $(".jx-vault-list");
  function renderVault() {
    if (!vaultList) return;
    const vault = safeRead(STORE.vault, []);
    vaultList.replaceChildren();
    if (!Array.isArray(vault) || !vault.length) {
      const empty = document.createElement("div");
      empty.className = "jx-vault-item";
      empty.textContent = "No local pins yet. Pinned replies stay in this browser only.";
      vaultList.append(empty);
      return;
    }
    vault.slice(0, 20).forEach((entry) => {
      const item = document.createElement("div");
      item.className = "jx-vault-item";
      item.textContent = String(entry.text || "").slice(0, 220);
      vaultList.append(item);
    });
  }
  renderVault();

  function attachMessageTools(message) {
    if (!message || message.dataset.jx33Tools === "true") return;
    const heading = $("strong", message);
    if (!heading || !heading.textContent.includes("JARVIS-X (local)")) return;
    const body = $("small", message);
    const replyText = body ? body.textContent.trim() : "";
    if (!replyText) return;
    message.dataset.jx33Tools = "true";
    const actions = document.createElement("div");
    actions.className = "jx-msg-actions";

    const makeButton = (label, action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jx-msg-tool";
      button.textContent = label;
      button.addEventListener("click", action);
      actions.append(button);
      return button;
    };
    makeButton("COPY", async (event) => {
      const button = event.currentTarget;
      try {
        await navigator.clipboard.writeText(replyText);
        button.textContent = "COPIED ✓";
      } catch (_) {
        button.textContent = "COPY UNAVAILABLE";
      }
    });
    makeButton("PIN LOCAL", (event) => {
      const button = event.currentTarget;
      const current = safeRead(STORE.vault, []);
      const vault = Array.isArray(current) ? current : [];
      const next = [{ text: replyText.slice(0, 220), pinnedAt: new Date().toISOString() }, ...vault].slice(0, 20);
      if (safeWrite(STORE.vault, next)) {
        button.textContent = "PINNED ✓";
        renderVault();
      } else {
        button.textContent = "STORAGE FULL";
      }
    });
    makeButton("SPEAK", () => {
      if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(replyText);
      utterance.lang = "fr-FR";
      window.speechSynthesis.speak(utterance);
    });
    message.append(actions);
  }

  const transcript = $("#transcript");
  if (transcript) {
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches && node.matches(".log")) attachMessageTools(node);
          if (node.querySelectorAll) node.querySelectorAll(".log").forEach(attachMessageTools);
        });
      });
    });
    observer.observe(transcript, { childList: true, subtree: true });
    transcript.querySelectorAll(".log").forEach(attachMessageTools);
  }

  const drawer = $("#jx-inspector-drawer");
  const drawerToggle = $("#jx-toggle-inspector");
  if (drawer && drawerToggle) {
    drawerToggle.addEventListener("click", () => {
      const open = drawer.classList.toggle("is-open");
      drawerToggle.classList.toggle("is-active", open);
      drawerToggle.setAttribute("aria-expanded", String(open));
    });
  }

  const input = $("#message");
  document.querySelectorAll("[data-slash-prompt]").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!input || input.disabled) return;
      input.value = chip.getAttribute("data-slash-prompt") || "";
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  const micButton = $("#jx-voice-mic");
  const voiceStatus = $("#jx-voice-status");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (micButton) {
    if (!SpeechRecognition) {
      micButton.disabled = true;
      if (voiceStatus) voiceStatus.textContent = "Voice dictation is not exposed by this browser. You can still type normally.";
    } else {
      const recognition = new SpeechRecognition();
      recognition.lang = document.documentElement.lang === "fr" ? "fr-FR" : "en-US";
      recognition.interimResults = false;
      recognition.continuous = false;
      micButton.addEventListener("click", () => {
        try {
          recognition.start();
          micButton.textContent = "LISTENING…";
          micButton.setAttribute("aria-pressed", "true");
          if (voiceStatus) voiceStatus.textContent = "Listening. Browser speech recognition may use browser-managed services; avoid dictating sensitive information.";
        } catch (_) {
          if (voiceStatus) voiceStatus.textContent = "Microphone could not start. Check browser permission and try again.";
        }
      });
      recognition.onresult = (event) => {
        const transcriptText = event.results && event.results[0] && event.results[0][0]
          ? event.results[0][0].transcript
          : "";
        if (input && transcriptText) {
          input.value = (input.value + " " + transcriptText).trim().slice(0, 4000);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };
      recognition.onerror = (event) => {
        if (voiceStatus) voiceStatus.textContent = "Voice recognition error: " + String(event.error || "unavailable") + ".";
      };
      recognition.onend = () => {
        micButton.textContent = "VOICE INPUT";
        micButton.setAttribute("aria-pressed", "false");
      };
    }
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORE.mode) {
      mode = modeClass(event.newValue);
      if (reducedMotion) draw(0);
    }
    if (event.key === STORE.vault) renderVault();
  });
  window.addEventListener("pageshow", () => {
    mode = modeClass((() => {
      try { return localStorage.getItem(STORE.mode) || "normal"; }
      catch (_) { return "normal"; }
    })());
    if (reducedMotion) draw(0);
  });
})();