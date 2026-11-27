import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [hq, observatory, css, behavior] = await Promise.all([
  readFile(new URL('../hq/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../hq/observatory.html', import.meta.url), 'utf8'),
  readFile(new URL('../hq/spatial-liquid-hud.css', import.meta.url), 'utf8'),
  readFile(new URL('../hq/spatial-liquid-hud.js', import.meta.url), 'utf8'),
]);

test('HQ shell keeps its existing views plus the new perception workspace and loads the shared Spatial Liquid HUD', () => {
  const views = [...hq.matchAll(/<section id="view-([a-z-]+)"/g)].map((match) => match[1]);
  assert.equal(views.length, 15);
  assert.ok(views.includes('clicky'));
  assert.ok(views.includes('perception'));
  assert.ok(hq.includes('./spatial-liquid-hud.css'));
  assert.ok(hq.includes('./spatial-liquid-hud.js'));
  assert.ok(hq.includes('id="jx-neural-pill"'));
  assert.ok(hq.includes('id="jx-control-dock"'));
});

test('Neural Pill reads existing UI state and does not invent service readiness', () => {
  for (const selector of ['#net-status', '#data-count', '#runtime-status', '#gateway-nav-state']) {
    assert.ok(behavior.includes(selector), `missing observed source ${selector}`);
  }
  assert.ok(behavior.includes("'UNKNOWN'"));
  assert.ok(behavior.includes('MutationObserver'));
});

test('Undo is explicitly limited to view navigation, not data or external actions', () => {
  assert.ok(behavior.includes('scoped to navigation history'));
  assert.ok(behavior.includes('history.pop()'));
  assert.ok(behavior.includes('data-jx-undo'));
  assert.ok(!behavior.includes('localStorage.setItem'));
});

test('Spatial Observatory retains its original controls and receives shared HUD tokens', () => {
  assert.ok(observatory.includes('./spatial-liquid-hud.css'));
  assert.ok(observatory.includes('jx-spatial-observatory'));
  assert.ok(observatory.includes('id="jx-neural-pill"'));
  assert.ok(observatory.includes('id="astrolabe"'));
  assert.ok(observatory.includes('class="dock"'));
});

test('Shared design tokens include the requested Obsidian Glass and contextual accents', () => {
  for (const token of ['#09090B', '#55DFF0', '#55D6A2', '#E7B65E', '#F07878']) {
    assert.ok(css.includes(token), `missing design token ${token}`);
  }
  assert.ok(css.includes('prefers-reduced-motion'));
});


test('Spatial HUD exposes navigable signal targets and the complete accent mapping', () => {
  for (const view of ['settings', 'memory', 'chat', 'gateway']) {
    assert.ok(hq.includes(`data-view="${view}"`));
  }
  assert.ok(behavior.includes("console:'cyan'"));
  assert.ok(behavior.includes("workspace:'emerald'"));
  assert.ok(behavior.includes("football:'amber'"));
  assert.ok(behavior.includes("audit:'red'"));
  assert.ok(css.includes('min-height:44px'));
  assert.ok(css.includes('min-width:44px'));
});
