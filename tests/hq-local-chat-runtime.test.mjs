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
