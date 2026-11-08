import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  assert.match(engine, /CreateMLCEngine/);
  assert.match(engine, /MAX_HISTORY_MESSAGES = 8/);
  assert.match(engine, /MAX_INPUT_CHARS = 4000/);
  assert.match(engine, /stream: true/);
  assert.match(engine, /return body;/);
  assert.match(engine, /for await \(const chunk of stream\)/);
  assert.match(engine, /No cloud fallback was attempted/);
  assert.match(engine, /input\.value = text/);
  assert.match(engine, /restored for retry/);
  assert.match(engine, /age-appropriate|minor/i);
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
  assert.match(page, /kept in page memory and are not synced/i);
  assert.match(page, /small starter model, not a frontier-model replacement/i);
  assert.match(page, /id="clear-chat"/);
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
  assert.match(engine, /LOCAL LOAD FAILED at /);
  assert.match(engine, /adapter\.limits/);
});

\ntest("local chat selects bounded task-aware sampling and reflects session state without remote memory", () => {
  const engine = read("../hq/local-chat-engine.js");
  const page = read("../hq/local-chat.html");
  assert.match(engine, /function selectSampling/);
  assert.match(engine, /mode: "precision", temperature: 0\.2, top_p: 0\.85/);
  assert.match(engine, /mode: "creative", temperature: 0\.85, top_p: 0\.95/);
  assert.match(engine, /mode: "balanced", temperature: 0\.6, top_p: 0\.92/);
  assert.match(engine, /top_p: sampling\.top_p/);
  assert.match(engine, /function reflectState/);
  assert.match(engine, /reflection\.failures/);
  assert.match(page, /id="cognitive-mode"/);
  assert.match(page, /does not read or write Memory OS/);
  assert.doesNotMatch(engine, /fetch\s*\(|supabase|openrouter/i);
});
