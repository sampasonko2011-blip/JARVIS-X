import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (path) => readFile(new URL('../hq/' + path, import.meta.url), 'utf8');

test('Interstellar v30 is wired into Observatory and the offline shell', async () => {
  const [html, sw, css, js, v29] = await Promise.all([
    read('observatory.html'), read('sw.js'), read('interstellar-v30.css'), read('interstellar-v30.js'), read('observatory-v29.js')
  ]);
  assert.match(html, /id="jx-interstellar-v30"/);
  assert.match(html, /interstellar-v30\.css/);
  assert.match(html, /interstellar-v30\.js/);
  assert.match(sw, /jarvis-x-hq-shell-v32/);
  assert.match(sw, /\.\/interstellar-v30\.css/);
  assert.match(sw, /\.\/interstellar-v30\.js/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /mode-sun/);
  assert.match(v29, /MOVE HUD/);
  assert.match(v29, /jarvis_x_v29_positions/);
  assert.match(js, /jarvis_x_v30_panel_sizes/);
  assert.doesNotMatch(js, /\.style\s*\./);
  assert.doesNotMatch(js, /innerHTML\s*=/);
  assert.doesNotMatch(js, /setInterval\s*\(/);
  assert.doesNotThrow(() => new vm.Script(js));
});

test('Local Chat loads Interstellar v30 and exposes honest browser dictation support', async () => {
  const [html, spatial, css, js] = await Promise.all([
    read('local-chat.html'), read('spatial-mode.js'), read('interstellar-v30.css'), read('interstellar-v30.js')
  ]);
  assert.match(html, /spatial-mode\.css/);
  assert.match(html, /spatial-mode\.js/);
  assert.match(html, /interstellar-v30\.css/);
  assert.match(html, /interstellar-v30\.js/);
  assert.match(html, /id="jx-interstellar-v30"/);
  assert.match(html, /id="voice-dictation"/);
  assert.match(js, /SpeechRecognition/);
  assert.match(js, /Voice dictation is not available in this browser/);
  assert.match(css, /mode-sun/);
  for (const key of ['jarvis_x_active_mode', 'jarvis_x_auto_audio', 'jarvis_x_volume']) {
    assert.ok(spatial.includes(key), 'missing shared key: ' + key);
  }
  assert.match(spatial, /mode-sun/);
});
