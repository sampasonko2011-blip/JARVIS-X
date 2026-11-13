import { test, expect } from '@playwright/test';

test('Interstellar v30 boots in Observatory and persists panel resize', async ({ page }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/observatory.html');
  await page.locator('#skip-boot').click().catch(() => {});
  await expect(page.locator('#jx-interstellar-v30')).toBeVisible();
  const assets = await Promise.all([
    page.request.get('/interstellar-v30.css'),
    page.request.get('/interstellar-v30.js')
  ]);
  expect(assets.every(response => response.ok())).toBeTruthy();

  await page.locator('#v29-open').click();
  await page.locator('.v29-launcher [data-v29-add="agents"]').click();
  const panel = page.locator('.v29-panel[data-type="agents"]');
  await expect(panel).toBeVisible();
  const before = await panel.boundingBox();
  if (!before) throw new Error('Agent panel has no layout box');
  const resize = panel.locator('.jx-v31-resize');
  const handle = await resize.boundingBox();
  if (!handle) throw new Error('v31 resize handle has no layout box');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 45, handle.y + handle.height / 2 + 30);
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => {
    const geometry = JSON.parse(localStorage.getItem('jarvis_x_v31_panel_geometry') || '{}');
    return geometry.agents?.width || 0;
  })).toBeGreaterThan(Math.round(before.width));
  expect(failures).toEqual([]);
});

test('Local Chat loads v30 assets and reports dictation support honestly', async ({ page }) => {
  await page.goto('/local-chat.html');
  await expect(page.locator('#jx-interstellar-v30')).toBeVisible();
  await expect(page.locator('#voice-dictation')).toBeVisible();
  await expect(page.locator('#voice-dictation-status')).toBeVisible();
  const [css, js] = await Promise.all([
    page.request.get('/interstellar-v30.css'),
    page.request.get('/interstellar-v30.js')
  ]);
  expect(css.ok()).toBeTruthy();
  expect(js.ok()).toBeTruthy();
  const supported = await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  if (!supported) {
    await expect(page.locator('#voice-dictation')).toBeDisabled();
    await expect(page.locator('#voice-dictation-status')).toContainText('not available');
  }
});
