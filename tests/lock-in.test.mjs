import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, module, hq] = await Promise.all([
  readFile(new URL('../hq/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../hq/hq.css', import.meta.url), 'utf8'),
  readFile(new URL('../hq/lock-in.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../hq/hq.js', import.meta.url), 'utf8'),
]);

test('LOCK IN and STOP controls are present and the controller is loaded', () => {
  assert.ok(html.includes('id="jx-lock-in"'));
  assert.ok(html.includes('id="jx-stop"'));
  assert.ok(html.includes('src="./lock-in.mjs"'));
});

test('LOCK IN isolates the active view and keeps inputs touch-sized', () => {
  assert.ok(module.includes('jx-lock-in'));
  assert.ok(module.includes('visibleView()'));
  assert.ok(css.includes('overflow:auto;overscroll-behavior:contain'));
  assert.ok(css.includes('min-height:48px'));
  assert.ok(css.includes('width:100%'));
});

test('STOP aborts registered chat requests and returns the controller to NORMAL', () => {
  assert.ok(module.includes('window.jxAbortAll("JX_STOP")'));
  assert.ok(module.includes('window.addEventListener("jx:stop"'));
  assert.ok(module.includes('setMode(false)'));
  assert.ok(hq.includes('window.jxRegisterAbortController?.(controller)'));
  assert.ok(hq.includes('releaseStop?.()'));
});
