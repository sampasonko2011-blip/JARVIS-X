import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, module, calendar] = await Promise.all([
  readFile(new URL('../hq/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../hq/future-scenario.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../hq/workspace-calendar.js', import.meta.url), 'utf8'),
]);

test('Future scenario view reads only imported local calendar evidence', () => {
  assert.ok(html.includes('data-view="future"'));
  assert.ok(html.includes('id="view-future"'));
  assert.ok(calendar.includes('window.jxReadCalendarEvents'));
  assert.ok(module.includes('window.jxReadCalendarEvents()'));
  assert.ok(module.includes('latestPronoteSnapshot'));
  assert.ok(module.includes('jx:pronote-snapshot'));
  assert.ok(module.includes('Actual training load / RPE / recovery history'));
});

test('Future scenario refuses fabricated calibrated probabilities and intervals', () => {
  assert.ok(html.includes('Probability:</strong> NOT ESTIMATED'));
  assert.ok(html.includes('Uncertainty interval:</strong> NOT ESTIMABLE'));
  assert.ok(module.includes('Aucune probabilité causale n’est publiée'));
  assert.ok(module.includes('held-out'));
  assert.ok(module.includes('UNKNOWN'));
});

test('Future scenario exposes no mutation route and keeps L3 as a prerequisite', () => {
  assert.ok(module.includes('Pas de branche Git créée'));
  assert.ok(module.includes('approbation L3'));
  assert.ok(!module.includes('fetch('));
});
