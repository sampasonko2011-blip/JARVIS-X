import { CreateMLCEngine, prebuiltAppConfig } from "@mlc-ai/web-llm";

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const MAX_INPUT_CHARS = 4000;\nconst MAX_HISTORY_MESSAGES = 8;\nconst SYSTEM = "You are JARVIS-X, one unified assistant. Be honest about capabilities and evidence. Do not claim external agents, tools, memory, or actions were used unless they actually were. This local model has no network tools or access to the user's private HQ data. Keep responses age-appropriate for a teenage user.";
const $ = (id) => document.getElementById(id);
const loadButton = $("load-model");
const sendButton = $("send-message");
const clearButton = $("clear-chat");
const status = $("runtime-status");
const detail = $("runtime-detail");
const progress = $("progress");
const transcript = $("transcript");
const input = $("message");
let engine = null;
let messages = [{ role: "system", content: SYSTEM }];
let busy = false;

function append(role, content) {
  const item = document.createElement("div");
  item.className = "log";
  const title = document.createElement("strong");
  title.textContent = role === "user" ? "You" : "JARVIS-X (local)";
  const body = document.createElement("small");
  body.textContent = content;
  item.append(title, body);
  transcript.append(item);
}
function setBusy(value) {
  busy = value;
  sendButton.disabled = value || !engine;
  loadButton.disabled = value || !!engine;
  input.disabled = value || !engine;
  clearButton.disabled = value || !engine;
}
loadButton.addEventListener("click", async () => {
  if (engine || busy) return;
  if (!window.isSecureContext || !navigator.gpu) {
    status.textContent = "UNAVAILABLE";
    detail.textContent = "Secure context and WebGPU are required. No cloud fallback was attempted.";
    return;
  }
  setBusy(true);
  status.textContent = "LOADING";
  progress.textContent = "Checking GPU adapter…";
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter available.");
    const supported = prebuiltAppConfig.model_list.some((item) => item.model_id === MODEL_ID);
    if (!supported) throw new Error("Pinned model ID is not present in this WebLLM package.");
    progress.textContent = "Downloading model and GPU runtime. First load may take several minutes…";
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (p) => {
        const pct = Number.isFinite(p.progress) ? Math.round(p.progress * 100) + "%" : "";
        progress.textContent = (p.text || "Preparing local model…") + (pct ? " " + pct : "");
      }
    });
    status.textContent = "READY";
    detail.textContent = "Model loaded in this browser. No hosted inference is configured.";
    progress.textContent = "Local model ready. Messages stay in this page session.";
    input.disabled = false;
    clearButton.disabled = false;
  } catch (error) {
    engine = null;
    status.textContent = "LOAD FAILED";
    detail.textContent = error instanceof Error ? error.message : "Unknown model-load error.";
    progress.textContent = "No cloud fallback was attempted. Check browser/GPU compatibility and available memory.";
  } finally {
    setBusy(false);
  }
});
sendButton.addEventListener("click", async () => {
  const text = input.value.trim();
  if (!engine || !text || busy) return;
  input.value = "";
  append("user", text);
  messages.push({ role: "user", content: text });
  setBusy(true);
  try {
    const response = await engine.chat.completions.create({
      messages,
      temperature: 0.7,
      max_tokens: 512
    });
    const answer = response.choices?.[0]?.message?.content || "(No text returned.)";
    messages.push({ role: "assistant", content: answer });\n    messages = [messages[0], ...messages.slice(1).slice(-MAX_HISTORY_MESSAGES)];
    append("assistant", answer);
    progress.textContent = "Generated locally on this device.";
  } catch (error) {
    messages.pop();
    progress.textContent = "Generation failed: " + (error instanceof Error ? error.message : "unknown error");
  } finally {
    setBusy(false);
    input.focus();
  }
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendButton.click();
  }
});
clearButton.addEventListener("click", () => {
  messages = [{ role: "system", content: SYSTEM }];
  transcript.replaceChildren();
  append("assistant", "Local conversation cleared.");
});
