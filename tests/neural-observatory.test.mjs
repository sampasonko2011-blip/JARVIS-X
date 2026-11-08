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
