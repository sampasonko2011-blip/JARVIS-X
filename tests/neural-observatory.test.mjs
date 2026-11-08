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

test("observatory presentation is responsive and honors reduced-motion preference", async () => {
  const css = await read("../hq/neural-observatory.css");
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /--jx-gold/);
  assert.match(css, /--jx-ice/);
});

test("telemetry keeps memory and integration status explicitly unverified", async () => {
  const js = await read("../hq/neural-observatory.js");
  assert.match(js, /Live read\/write not yet verified/);
  assert.match(js, /Policy module present; local integration pending/);
  assert.match(js, /Authorization and budget gates retained/);
  assert.match(js, /dataset\.observatoryReady/);
});
