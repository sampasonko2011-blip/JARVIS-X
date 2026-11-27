import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, module, css, engine] = await Promise.all([
  readFile(new URL("../hq/local-chat.html", import.meta.url), "utf8"),
  readFile(new URL("../hq/rich-chat-studio.mjs", import.meta.url), "utf8"),
  readFile(new URL("../hq/rich-chat-studio.css", import.meta.url), "utf8"),
  readFile(new URL("../hq/local-chat-engine.js", import.meta.url), "utf8")
]);

test("Rich Chat Studio is mounted in the local chat workspace", () => {
  assert.ok(html.includes('id="rich-chat-studio"') === false, "studio is created by its module at runtime");
  assert.ok(html.includes('src="./rich-chat-studio.mjs"'));
  assert.ok(html.includes('href="./rich-chat-studio.css"'));
  assert.ok(module.includes('root.id = "rich-chat-studio"'));
});

test("engine badge and live stage are driven by real local runtime events", () => {
  assert.ok(module.includes('addEventListener("jx:chat-engine"'));
  assert.ok(module.includes('addEventListener("jx:chat-stage"'));
  assert.ok(engine.includes('new CustomEvent("jx:chat-engine"'));
  assert.ok(engine.includes('Génération WebLLM sur cet appareil'));
  assert.ok(!module.includes("AgentFactory terminé"));
});

test("style and persona controls are connected to safe local presentation", () => {
  assert.ok(module.includes('id="rcs-style"'));
  assert.ok(module.includes('id="rcs-persona"'));
  assert.ok(module.includes("function personaPrompt()"));
  assert.ok(engine.includes("window.JXRichChatStudio?.personaPrompt?.()"));
  assert.ok(css.includes("prefers-reduced-motion:reduce"));
});

test("selection actions prepare prompts and storyboard cards without executing arbitrary code", () => {
  assert.ok(module.includes('data-action="simplify"'));
  assert.ok(module.includes('data-action="study"'));
  assert.ok(module.includes('data-action="clicky"'));
  assert.ok(module.includes('data-action="storyboard"'));
  assert.ok(module.includes("textContent = content"));
  assert.ok(!module.includes("eval("));
  assert.ok(!module.includes("innerHTML = content"));
});

test("cloud status is explicitly unavailable rather than inferred from memory connectivity", () => {
  assert.ok(module.includes("CLOUD INFERENCE · NOT CONFIGURED"));
  assert.ok(module.includes("Le Gateway mémoire n’est pas un moteur de réponse Cloud"));
});

test("generated artifacts run only in an opaque-origin sandbox with network CSP and L3-gated save request", () => {
  assert.ok(module.includes('frame.setAttribute("sandbox", "allow-scripts")'));
  assert.ok(!module.includes("allow-same-origin"));
  assert.ok(module.includes("default-src 'none'"));
  assert.ok(module.includes("connect-src 'none'"));
  assert.ok(module.includes("artifact.html.length > 150_000"));
  assert.ok(module.includes("requiresL3: true"));
  assert.ok(module.includes("persistance non confirmée"));
});

test("assistant output contract connects model text to the sandbox renderer", () => {
  assert.ok(module.includes("function processAssistantText(text)"));
  assert.ok(module.includes("jx-artifact"));
  assert.ok(module.includes("processAssistantText"));
  assert.ok(module.includes("navigate-to 'none'"));
  assert.ok(engine.includes("processAssistantText?.(answer)"));
  assert.ok(engine.includes("max_tokens: /mini-app"));
});
