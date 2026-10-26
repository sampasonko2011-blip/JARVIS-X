import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const root = new URL("../hq/", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("hq.css", root), "utf8");
const js = await readFile(new URL("hq.js", root), "utf8");

test("HQ loads same-origin external CSS and JavaScript assets", () => {
  assert.match(html, /<link\s+rel="stylesheet"\s+href="\.\/hq\.css"/i);
  assert.match(html, /<script\s+src="\.\/hq\.js"><\/script>/i);
  assert.match(css, /:root\s*\{/);
  assert.match(js, /\brender\(\);\s*$/);
});

test("HQ contains no inline script, style block, or style attributes", () => {
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\sstyle\s*=\s*["']/i);
  assert.doesNotMatch(js, /\sstyle\s*=\s*["']/i);
});

test("HQ retains the compatibility CSP until browser verification completes", () => {
  assert.match(html, /Content-Security-Policy[^>]*script-src 'self' 'unsafe-inline'/);
  assert.match(html, /Content-Security-Policy[^>]*style-src 'self' 'unsafe-inline'/);
});
