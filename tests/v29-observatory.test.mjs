import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('v29 Observatory exposes the module launcher and all requested modules', async () => {
  const html = await read('../hq/observatory.html');
  const js = await read('../hq/observatory-v29.js');
  for (const id of ['v29-open', 'v29-launcher', 'v29-panels']) assert.match(html, new RegExp(id));
  for (const module of ['agents','briefs','vault','prompts','image','recovery','telemetry']) assert.ok(js.includes(module));
  assert.match(js, /MOVE HUD/);
});

test('v29 spatial audio persists mode, enablement and volume', async () => {
  const js = await read('../hq/spatial-mode.js');
  for (const key of ['jarvis_x_active_mode','jarvis_x_auto_audio','jarvis_x_volume']) assert.ok(js.includes(key));
  assert.match(js, /\[200,240\]/);
  assert.match(js, /\[110,112\]/);
  assert.match(js, /528/);
  assert.match(js, /setVolume/);
});

test('v29 Service Worker uses its own cache and precaches the new module', async () => {
  const sw = await read('../hq/sw.js');
  assert.match(sw, /jarvis-x-hq-shell-v32/);
  assert.match(sw, /observatory-v29\.js/);
  assert.match(sw, /clients\.claim/);
});

test('v29 browser scripts parse without syntax errors', async () => {
  for (const path of ['hq/observatory.js','hq/observatory-v29.js','hq/spatial-mode.js','hq/sw.js']) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, path + ': ' + result.stderr);
  }
});
