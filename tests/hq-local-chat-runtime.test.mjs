import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectSampling } from "../hq/cognitive-policy.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("local HQ chat pins WebLLM and bundles a self-hosted browser runtime", () => {
  const pkg = JSON.parse(read("../package.json"));
  assert.equal(pkg.dependencies["@mlc-ai/web-llm"], "0.2.87");
  assert.equal(pkg.scripts["build:local-chat"].includes("esbuild hq/local-chat-engine.js"), true);
  assert.equal(pkg.scripts.build.includes("npm run build:local-chat"), true);
});

test("local chat uses the registered small Qwen model with no cloud inference fallback", () => {
  const engine = read("../hq/local-chat-engine.js");
  assert.match(engine, /Qwen2\.5-0\.5B-Instruct-q4f16_1-MLC/);
  assert.match(engine, /Qwen2\.5-1\.5B-Instruct-q4f16_1-MLC/);
  assert.match(engine, /MODEL_PREFERENCE_ORDER/);
  assert.match(engine, /prebuiltAppConfig\?\.model_list/);
  assert.doesNotMatch(engine, /Llama-3\.2-3B-Instruct-q4f16_1-MLC/);
  assert.match(engine, /CreateMLCEngine/);
  assert.match(engine, /MAX_HISTORY_MESSAGES = 8/);
  assert.doesNotMatch(engine, /MAX_INPUT_CHARS/);
  assert.match(engine, /MODEL_CONTEXT_CHAR_BUDGET/);
  assert.match(engine, /function compactLocalHistory/);
  assert.match(engine, /messages: compactLocalHistory\(messages/);
  assert.match(engine, /stream: true/);
  assert.match(engine, /buildSystemPrompt\(cognitiveRoute\)/);
  assert.match(engine, /temperature: cognitiveRoute \? cognitiveRoute\.temperature : sampling\.temperature/);
  assert.match(engine, /role: "system", content: SYSTEM/);
  assert.match(engine, /return body;/);
  assert.match(engine, /for await \(const chunk of stream\)/);
  assert.match(engine, /No cloud fallback was attempted/);
  assert.match(engine, /input\.value = text/);
  assert.match(engine, /restored for retry/);
  assert.match(engine, /adolescent|age-appropriate|minor/i);
  assert.doesNotMatch(engine, /fetch\s*\(|supabase|openrouter/i);
});

test("local chat page loads only the self-hosted bundle and is discoverable from HQ", () => {
  const page = read("../hq/local-chat.html");
  const index = read("../hq/index.html");
  const sw = read("../hq/sw.js");
  assert.match(page, /local-chat-engine\.bundle\.js/);
  assert.doesNotMatch(page, /\sstyle=/i);
  assert.match(index, /href="\.\/local-chat\.html"/);
  assert.match(sw, /local-chat-engine\.bundle\.js/);
  assert.match(sw, /local-chat\.html/);
});


test("local chat explains download, local-only session scope, model limits, and clear action", () => {
  const page = read("../hq/local-chat.html");
  const engine = read("../hq/local-chat-engine.js");
  assert.match(page, /first load downloads model files/i);
  assert.match(page, /No cloud inference fallback exists/i);
  assert.match(page, /Recent turns are compacted locally/i);
  assert.match(page, /small starter model, not a frontier-model replacement/i);
  assert.match(page, /id="clear-chat"/);
  const apex = read("../hq/v46-apex.js");
  const gateway = read("../supabase/functions/hq-gateway-v12/index.ts");
  assert.match(apex, /GATEWAY \+ "\/image"/);
  assert.match(apex, /user_confirmed: true/);
  assert.match(apex, /Aucun fallback externe n'a été utilisé/);
  assert.match(gateway, /JX_ENABLE_IMAGE_GENERATION/);
  assert.match(gateway, /JARVIS_X_GEMINI_API_KEY/);
  assert.match(gateway, /reserveImageBudget\(user\.id\)/);
  assert.match(engine, /clearButton\.addEventListener\("click"/);
  assert.match(engine, /Local conversation cleared/);
  assert.doesNotMatch(engine, /localStorage|sessionStorage|indexedDB/i);
});

test("device preflight never overstates WebGPU availability as successful model inference", () => {
  const page = read("../hq/local-chat-preflight.html");
  const script = read("../hq/local-chat-preflight.js");
  assert.match(page, /does not download a model/i);
  assert.match(page, /approximately 945 MB/i);
  assert.match(page, /cannot prove that Safari can load the model/i);
  assert.match(script, /PRELIMINARY PASS: WebGPU is exposed/i);
  assert.match(script, /no inference has run/i);
});

test("local model load failures report the exact initialization stage and underlying cause", () => {
  const engine = read("../hq/local-chat-engine.js");
  assert.match(engine, /loadStage = "adapter"/);
  assert.match(engine, /loadStage = "download-and-initialize"/);
  assert.match(engine, /Failed during " \+ loadStage/);
  assert.match(engine, /errorName/);
  assert.match(engine, /errorMessage/);
  assert.match(engine, /ÉCHEC DU CHARGEMENT LOCAL à l’étape/);
  assert.match(engine, /adapter\.limits/);
});


test("local chat selects bounded task-aware sampling and reflects session state without remote memory", () => {
  const engine = read("../hq/local-chat-engine.js");
  const policy = read("../hq/cognitive-policy.js");
  const page = read("../hq/local-chat.html");
  assert.match(policy, /export function selectSampling/);
  assert.match(policy, /mode: "precision", temperature: 0\.2, top_p: 0\.85/);
  assert.match(policy, /mode: "creative", temperature: 0\.85, top_p: 0\.95/);
  assert.match(policy, /mode: "balanced", temperature: 0\.6, top_p: 0\.92/);
  assert.match(engine, /top_p: sampling\.top_p/);
  assert.match(engine, /function reflectState/);
  assert.match(engine, /reflection\.failures/);
  assert.match(page, /id="cognitive-mode"/);
  assert.match(page, /does not read or write Memory OS/);
  assert.doesNotMatch(engine, /fetch\s*\(|supabase|openrouter/i);
});


test("local chat delegates multilingual task classification to the shared policy", () => {
  const engine = read("../hq/local-chat-engine.js");
  const policy = read("../hq/cognitive-policy.js");
  assert.match(engine, /import \{ selectSampling \} from "\.\/cognitive-policy\.js"/);
  assert.match(policy, /normalize\("NFD"\)/);
  assert.match(policy, /erreur\|debug/);
  assert.match(policy, /idee\|story\|histoire/);
});


test("adaptive sampling classifies real English and French inputs", () => {
  assert.equal(selectSampling("Debug this JavaScript error").mode, "precision");
  assert.equal(selectSampling("Peux-tu vérifier cette erreur de sécurité ?").mode, "precision");
  assert.equal(selectSampling("Fais un calcul et explique la preuve").mode, "precision");
  assert.equal(selectSampling("Imagine une histoire créative").mode, "creative");
  assert.equal(selectSampling("Écris une idée de jeu").mode, "creative");
  assert.equal(selectSampling("Hello, how are you?").mode, "balanced");
  assert.equal(selectSampling("Imagine a design and debug this code").mode, "precision");
});

test("adaptive policy classifies real English and French prompts with bounded settings", () => {
  const cases = [
    ["Fix this JavaScript bug", "precision"],
    ["Corrige cette erreur dans mon script", "precision"],
    ["Fais un audit de sécurité", "precision"],
    ["Write a fantasy story", "creative"],
    ["Imagine un concept original", "creative"],
    ["Salut, comment ça va ?", "balanced"],
    ["Explain the history of football", "balanced"],
  ];
  for (const [prompt, expected] of cases) {
    const result = selectSampling(prompt);
    assert.equal(result.mode, expected, prompt);
    assert.ok(result.temperature >= 0 && result.temperature <= 1, prompt);
    assert.ok(result.top_p > 0 && result.top_p <= 1, prompt);
    assert.ok(result.frequency_penalty >= -2 && result.frequency_penalty <= 2, prompt);
    assert.ok(result.presence_penalty >= -2 && result.presence_penalty <= 2, prompt);
  }
});

test("precision takes precedence over creative cues in mixed prompts", () => {
  assert.equal(selectSampling("Design a new app and debug this code").mode, "precision");
  assert.equal(selectSampling("Conçois une idée et corrige ce bug").mode, "precision");
});

test("clearing local chat resets session-only cognitive reflection counters", () => {
  const engine = read("../hq/local-chat-engine.js");
  assert.match(engine, /reflection = \{ turns: 0, failures: 0, lastMode: "balanced" \}/);
  assert.match(engine, /renderReflection\(\);[\s\S]*?transcript\.replaceChildren\(\)/);
});

test("local model selector prefers Qwen and resolves only model IDs in the installed package", () => {
  const page = read("../hq/local-chat.html");
  const engine = read("../hq/local-chat-engine.js");
  assert.match(page, /id="jx-model-select"/);
  assert.match(page, /value="SmolLM2-135M-Instruct-q0f16-MLC"/);
  assert.match(page, /value="SmolLM2-360M-Instruct-q4f32_1-MLC"/);
  assert.match(page, /value="Qwen2\.5-0\.5B-Instruct-q4f16_1-MLC"/);
  assert.match(page, /value="Qwen2\.5-1\.5B-Instruct-q4f16_1-MLC"/);
  assert.doesNotMatch(page, /value="Llama-3\.2-3B-Instruct-q4f16_1-MLC"/);
  assert.doesNotMatch(engine, /DEFAULT_MODEL_ID/);
  assert.match(engine, /const requestedModel = modelSelect\?\.value/);
  assert.match(engine, /Select a local model before loading/);
  assert.match(engine, /status\.textContent = "READY · " \+ selectedModel/);
  assert.match(engine, /modelSelect\.disabled = value \|\| !!engine/);
  assert.match(engine, /"Qwen2\.5-3B-Instruct-q4f16_1-MLC"/);
  assert.doesNotMatch(engine, /ALLOWED_MODEL_IDS/);
  assert.match(engine, /modelList\.map\(\(item\) => item\?\.model_id\)/);
  assert.match(engine, /prebuiltAppConfig\?\.model_list/);
  assert.match(engine, /id\.length > 0/);
  assert.match(engine, /createLocalEngine\(selectedModel/);
  assert.match(engine, /appConfig: prebuiltAppConfig/);
  assert.match(engine, /resolveAvailableModel\(prebuiltAppConfig\?\.model_list, requestedModel\)/);
  assert.match(engine, /Qwen2\.5-3B-Instruct-q4f16_1-MLC/);
  assert.match(engine, /Phi-3\.5-mini-instruct-q4f16_1-MLC/);
  assert.match(engine, /Qwen2\.5-Coder-1\.5B-Instruct-q4f16_1-MLC/);
  assert.match(engine, /gemma-2-2b-it-q4f16_1-MLC/);
});

test("v39 local chat injects a compact live JARVIS-X system prompt before every completion", () => {
  const brain = read("../hq/jarvis-brain-v36.js");
  const engine = read("../hq/local-chat-engine.js");
  for (const marker of ["Tu es JARVIS-X", "COCKPIT LIVE", "Mode=", "Agent=", "Route=", "Température=", "Heure locale=", "MÉMOIRE LOCALE"]) assert.ok(brain.includes(marker), marker);
  assert.match(brain, /buildSystemPrompt/);
  assert.match(engine, /messages\[0\]\.content = systemPrompt/);
  assert.match(engine, /temperature: cognitiveRoute \? cognitiveRoute\.temperature : sampling\.temperature/);
  assert.match(engine, /cognitiveBrain\.record/);
});

test("v40 adds explicit-only memory capture, generic disclaimer cleanup, and a two-turn memory bound", () => {
  const brain = read("../hq/jarvis-brain-v36.js");
  const engine = read("../hq/local-chat-engine.js");
  assert.match(brain, /explicitMemoryNote/);
  assert.match(brain, /storeLocalMemory/);
  assert.match(brain, /sanitizeResponse/);
  assert.match(brain, /retiens/);
  assert.match(engine, /MAX_HISTORY_MESSAGES = 8/);
  assert.match(engine, /max_tokens: \/mini-app\|interface interactive\|simulation interactive\|schéma interactif\|outil interactif\/i\.test\(text\) \? 1024 : 384/);
  assert.match(engine, /memoryBridge\.remember/);
  assert.match(engine, /explicitMemoryNote/);
});


test("v41 role lock and XMemo status are present", () => {
 const brain=read("../hq/jarvis-brain-v36.js"); const engine=read("../hq/local-chat-engine.js"); const page=read("../hq/local-chat.html");
 assert.match(brain,/IDENTITÉ VERROUILLÉE/); assert.match(brain,/ne l'appelle jamais JARVIS-X/);
 assert.match(brain,/bonjour|bonsoir|salut|hello/); assert.match(engine,/IDENTITÉ EXÉCUTIVE — JARVIS-X/);
 assert.match(page,/id="jx-xmemo-sync-status"/); assert.match(engine,/CLOUD REQUIRES CONSENT/); assert.match(engine,/XMEMO CLOUD SYNCED/);
 assert.match(page,/945 MB GPU memory/); assert.match(page,/1\.63 GB GPU memory/); assert.doesNotMatch(page,/\\sstyle=/i);
});


test("v45 Observatory and Local Chat provide direct reciprocal navigation", () => {
  const observatory = read("../hq/observatory.html");
  const chat = read("../hq/local-chat.html");
  assert.match(observatory, /<a href="\.\/local-chat\.html">CHAT IA<\/a>/);
  assert.match(chat, /href="\.\/observatory\.html">🔭 OBSERVATORY/);
});
