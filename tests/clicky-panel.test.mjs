import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, module] = await Promise.all([
  readFile(new URL('../hq/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../hq/hq.css', import.meta.url), 'utf8'),
  readFile(new URL('../hq/clicky-panel.mjs', import.meta.url), 'utf8'),
]);

test('Clicky is a dedicated HQ view with the live Pencil canvas in a split workspace', () => {
  assert.ok(html.includes('data-view="clicky"'));
  assert.ok(html.includes('id="view-clicky"'));
  assert.ok(html.includes('id="clicky-canvas-host"'));
  assert.ok(html.includes('src="./clicky-panel.mjs"'));
  assert.ok(module.includes('canvasHost.replaceChildren(target.parentElement)'));
});

test('Clicky overlay never captures touch or pointer input and is removed on deactivation', () => {
  assert.match(css, /\.clicky-overlay\s*\{[^}]*pointer-events:none/s);
  assert.ok(module.includes('this.overlayCanvas?.classList.toggle("is-active", this.active)'));
  assert.ok(module.includes('if (!this.active) this.clearHighlights()'));
});

test('Live gateway calls require explicit opt-in and reject mock fixtures as AI answers', () => {
  assert.ok(html.includes('id="clicky-live-consent" type="checkbox"'));
  assert.ok(module.includes('#clicky-live-consent') && module.includes('checked'));
  assert.ok(module.includes('#chat-execution-mode') && module.includes('"live"'));
});

test('Clicky scales canvas markers and keeps the original canvas separate', () => {
  assert.ok(module.includes('const scaleX = width / 1000'));
  assert.ok(module.includes('const scaleY = height / 440'));
  assert.ok(module.includes('pointer-events'));
  assert.ok(module.includes('canvasSnapshotPng'));
});

test('Clicky voice controls use browser speech APIs with explicit stop control', () => {
  assert.ok(module.includes('window.SpeechRecognition || window.webkitSpeechRecognition'));
  assert.ok(module.includes('SpeechSynthesisUtterance'));
  assert.ok(html.includes('id="clicky-stop-voice"'));
});
