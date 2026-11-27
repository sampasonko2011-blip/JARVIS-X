import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, module, registry] = await Promise.all([
  readFile(new URL('../hq/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../hq/webscout-handoff.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/hq-gateway-v12/default-capabilities.mjs', import.meta.url), 'utf8'),
]);

test('WebScout reports the actual registered capability set and fails closed without search', () => {
  assert.ok(registry.includes('name: "text.analyze"'));
  assert.ok(!registry.includes('name: "web.search"'));
  assert.ok(module.includes('No web search/browser capability is exposed'));
  assert.ok(html.includes('id="webscout-status-tag"'));
});

test('Smart Handoff only prepares and copies local payload; external opening is user initiated', () => {
  assert.ok(module.includes('Prepared locally'));
  assert.ok(module.includes('No external tool was opened, invoked or executed'));
  assert.ok(html.includes('id="handoff-open-higgsfield"'));
  assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
});
