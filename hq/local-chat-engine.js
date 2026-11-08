import { CreateMLCEngine, prebuiltAppConfig } from "@mlc-ai/web-llm";

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const MAX_INPUT_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 8;
const SYSTEM = "You are JARVIS-X, one unified assistant. Be honest about capabilities and evidence. Do not claim external agents, tools, memory, or actions were used unless they actually were. This local model has no network tools or access to the user's private HQ data. Keep responses age-appropriate for a teenage user.";
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
let loadStage = "idle";
let reflection = { turns: 0, failures: 0, lastMode: "balanced" };

function selectSampling(message) {
  const text = String(message || "").toLowerCase();
  const strict = /\b(code|bug|error|debug|git|server|architecture|script|math|calculate|prove|verify|audit|security)\b/.test(text);
  const creative = /\b(idea|story|brainstorm|design|imagine|creative|write|name|concept)\b/.test(text);
  if (strict) return { mode: "precision", temperature: 0.2, top_p: 0.85, frequency_penalty: 0.1, presence_penalty: 0 };
  if (creative) return { mode: "creative", temperature: 0.85, top_p: 0.95, frequency_penalty: 0.15, presence_penalty: 0.1 };
  return { mode: "balanced", temperature: 0.6, top_p: 0.92, frequency_penalty: 0.1, presence_penalty: 0 };
}

function reflectState(mode, answer, failed = false) {
  reflection.turns += 1;
  if (failed) reflection.failures += 1;
  reflection.lastMode = mode;
  const panel = document.getElementById("cognitive-state");
  const modeLabel = document.getElementById("cognitive-mode");
  if (modeLabel) modeLabel.textContent = "ADAPTIVE MODE · " + mode.toUpperCase();
  if (panel) panel.textContent = "Turns: " + reflection.turns + " · Errors: " + reflection.failures + " · Last output: " + (answer?.length || 0) + " chars";
}

function append(role, content) {
  const item = document.createElement("div");
  item.className = "log";
  const title = document.createElement("strong");
  title.textContent = role === "user" ? "You" : "JARVIS-X (local)";
  const body = document.createElement("small");
  body.textContent = content;
  item.append(title, body);
  transcript.append(item);
  return body;
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
  loadStage = "adapter";
  progress.textContent = "Stage 1/3: requesting a WebGPU adapter…";
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No WebGPU adapter available.");
    const supported = prebuiltAppConfig.model_list.some((item) => item.model_id === MODEL_ID);
    if (!supported) throw new Error("Pinned model ID is not present in this WebLLM package.");
    loadStage = "download-and-initialize";
    const limits = adapter.limits || {};
    const gpuSummary = [
      "GPU adapter accepted.",
      Number.isFinite(limits.maxBufferSize) ? "maxBufferSize=" + limits.maxBufferSize : "",
      Number.isFinite(limits.maxStorageBufferBindingSize) ? "maxStorageBufferBindingSize=" + limits.maxStorageBufferBindingSize : ""
    ].filter(Boolean).join(" ");
    detail.textContent = gpuSummary + " Starting model download/initialization.";
    progress.textContent = "Stage 2/3: downloading model and initializing WebGPU runtime. First load can take several minutes; keep Safari open.";
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (p) => {
        const pct = Number.isFinite(p.progress) ? Math.round(p.progress * 100) + "%" : "";
        progress.textContent = (p.text || "Preparing local model…") + (pct ? " " + pct : "");
      }
    });
    loadStage = "ready";
    status.textContent = "READY";
    detail.textContent = "Model loaded in this browser. No hosted inference is configured.";
    progress.textContent = "Local model ready. Messages stay in this page session.";
    input.disabled = false;
    clearButton.disabled = false;
  } catch (error) {
    engine = null;
    status.textContent = "LOAD FAILED";
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const cause = error && typeof error === "object" && "cause" in error && error.cause
      ? " Cause: " + String(error.cause)
      : "";
    detail.textContent = "Failed during " + loadStage + ". " + errorName + ": " + errorMessage + cause;
    progress.textContent = "LOCAL LOAD FAILED at " + loadStage + ": " + errorName + ": " + errorMessage + ". No cloud fallback was attempted.";
  } finally {
    setBusy(false);
  }
});
sendButton.addEventListener("click", async () => {
  const text = input.value.trim().slice(0, MAX_INPUT_CHARS);
  if (!engine || !text || busy) return;
  input.value = "";
  append("user", text);
  messages.push({ role: "user", content: text });
  setBusy(true);
  let output = null;
  try {
    output = append("assistant", "");
    let answer = "";
    const sampling = selectSampling(text);
    const stream = await engine.chat.completions.create({
      messages,
      temperature: sampling.temperature,
      top_p: sampling.top_p,
      frequency_penalty: sampling.frequency_penalty,
      presence_penalty: sampling.presence_penalty,
      max_tokens: 512,
      stream: true
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string") {
        answer += delta;
        output.textContent = answer;
      }
    }
    if (!answer) answer = "(No text returned.)";
    output.textContent = answer;
    messages.push({ role: "assistant", content: answer });
    messages = [messages[0], ...messages.slice(1).slice(-MAX_HISTORY_MESSAGES)];
    progress.textContent = "Generated locally on this device using " + sampling.mode + " sampling.";
    reflectState(sampling.mode, answer);
  } catch (error) {
    messages.pop();
    const reason = error instanceof Error ? error.message : "unknown error";
    if (output) output.textContent = "Generation failed: " + reason + ". Your message has been restored for retry.";
    input.value = text;
    reflectState("failed", reason, true);
    progress.textContent = "Generation failed. Your message is ready to retry: " + reason;
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
