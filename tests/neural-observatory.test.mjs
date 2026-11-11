import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("HQ loads the additive Neural Observatory layer without replacing existing runtime scripts", async () => {
  const html = await read("../hq/index.html");
  assert.match(html, /href="\.\/hq\.css"/);
  assert.match(html, /href="\.\/neural-observatory\.css"/);
  assert.match(html, /src="\.\/hq\.js"/);
  assert.match(html, /src="\.\/forge\.js"/);
  assert.match(html, /src="\.\/neural-observatory\.js"/);
  assert.match(html, /id="view-overview"/);
  assert.match(html, /href="\.\/local-chat\.html"/);
});

test("observatory presentation is responsive, premium-lit and honors reduced motion", async () => {
  const css = await read("../hq/neural-observatory.css");
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /--jx-gold/);
  assert.match(css, /--jx-ice/);
  assert.match(css, /jx-neural-links/);
  assert.match(css, /jx-node-pulse/);
});

test("decorative neural constellation is accessible and telemetry avoids false live claims", async () => {
  const js = await read("../hq/neural-observatory.js");
  assert.match(js, /setAttribute\("aria-hidden","true"\)/);
  assert.match(js, /Live recall\/store not verified/);
  assert.match(js, /Local-chat integration pending/);
  assert.match(js, /Live execution requires separate verification/);
  assert.match(js, /dataset\.observatoryReady/);
});


test("overview accurately distinguishes source-integrated gateway and XMemo from deployed verification", async () => {
  const html = await read("../hq/index.html");
  assert.match(html, /consent-gated XMemo adapter are integrated in source/);
  assert.match(html, /deployed gateway configuration and live memory read\/write remain unverified/);
  assert.match(html, /browser-local WebGPU chat does not access XMemo/);
  assert.match(html, /Secure sign-in \/ XMemo gateway/);
  assert.match(html, /SOURCE INTEGRATED/);
  assert.match(html, /Executive gateway \/ capabilities/);
  assert.match(html, /optional local tool execution is disabled by default/);
});

test("HQ exposes an explicit stable link to the separate football career workspace", async () => {
  const html = await read("../hq/index.html");
  assert.match(html, /href="\/JARVIS-X\/career\//);
  assert.match(html, /Football mission · Sampa\.co/);
  assert.match(html, /aria-label="Open separate Sampa\.co football career workspace"/);
});

test("Conversation Nexus preserves authenticated chat contracts while adding the advanced iPad interface", async () => {
  const html = await read("../hq/index.html");
  const css = await read("../hq/conversation-experience.css");
  const js = await read("../hq/conversation-experience.js");
  for (const id of ["chat-thread","chat-compose","chat-send","chat-check-gateway","chat-memory-consent","chat-auth-send","chat-xmemo-connect","chat-xmemo-recall","chat-xmemo-remember","chat-execution-mode","chat-orchestration-mode"]) assert.match(html, new RegExp('id="'+id+'"'));
  assert.match(html, /conversation-experience\.css/);
  assert.match(html, /conversation-experience\.js/);
  assert.match(html, /data-chat-prompt/);
  assert.match(html, /jx-chat-welcome/);
  const chatClient = await read("../hq/hq.js");
  assert.match(chatClient, /jx-message-\x27\+esc\(x\.role\)/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(js, /No network, model calls or simulated streaming/);
  assert.match(js, /Draft remains local until you transmit/);
});

test("service worker precaches the complete observatory and conversation experience under a new cache version", async () => {
  const sw = await read("../hq/sw.js");
  assert.match(sw, /jarvis-x-hq-shell-v24/);
  for (const asset of ["conversation-experience.css","conversation-experience.js","neural-observatory.css","neural-observatory.js","observatory-premium.css"]) assert.match(sw,new RegExp(asset.replace(".","\\.")));
});


test("cinematic arrival is session-scoped, skippable, accessible and precached", async () => {
  const html = await read("../hq/index.html");
  const css = await read("../hq/arrival-experience.css");
  const js = await read("../hq/arrival-experience.js");
  const sw = await read("../hq/sw.js");
  assert.match(html, /id="jx-arrival"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /arrival-experience\.css/);
  assert.match(html, /observatory-premium\.css/);
  assert.match(html, /arrival-experience\.js/);
  assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /sessionStorage/);
  assert.match(js, /Escape/);
  assert.match(js, /jx-hq-arrival-seen/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /jx-arrival-enter/);
  assert.match(sw, /jarvis-x-hq-shell-v24/);
  assert.match(sw, /arrival-experience\.css/);
  assert.match(sw, /arrival-experience\.js/);
});


test("conversation command strip supports local search, transcript copy and accessible focus mode", async () => {
  const html = await read("../hq/index.html");
  const css = await read("../hq/conversation-experience.css");
  const js = await read("../hq/conversation-experience.js");
  assert.match(html, /id="jx-transcript-search"/);
  assert.match(html, /id="jx-transcript-copy"/);
  assert.match(html, /id="jx-chat-focus"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(js, /applySearch/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /aria-pressed/);
  assert.ok(js.includes('event.key==="/"' ));
  assert.match(css, /data-focus-mode/);
  assert.match(css, /jx-transcript-tools/);
});

test("global Locked-In Mode is reversible, keyboard-exitable and session-local", async () => {
  const html = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../hq/observatory-premium.css", import.meta.url), "utf8");
  const js = await readFile(new URL("../hq/hq.js", import.meta.url), "utf8");
  assert.match(html, /id="jx-global-focus"/);
  assert.match(css, /\.shell\.jx-global-focus/);
  assert.match(js, /setGlobalFocus\(!globalShell\.classList\.contains\('jx-global-focus'\)\)/);
  assert.match(js, /event\.key==='Escape'.*setGlobalFocus\(false\)/);
  assert.doesNotMatch(js, /localStorage\.setItem\([^)]*focus/i);
});
