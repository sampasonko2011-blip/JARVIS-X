import { test, expect } from "@playwright/test";

async function setupGate(page) {
  await page.goto("/mission-control.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("#new-pass").fill("JX-test-passphrase-2026");
  await page.locator("#confirm-pass").fill("JX-test-passphrase-2026");
  await page.locator("#set-pass").click();
  await expect(page.locator("#gate")).toHaveClass(/hidden/);
}

test.beforeEach(async ({ page }) => {
  await setupGate(page);
});

test("local passphrase gate locks and unlocks the workspace", async ({ page }) => {
  await page.locator("#lock").click();
  await expect(page.locator("#gate")).not.toHaveClass(/hidden/);
  await page.locator("#unlock-pass").fill("wrong-passphrase");
  await page.locator("#unlock").click();
  await expect(page.locator("#gate-status")).toContainText("did not match");
  await page.locator("#unlock-pass").fill("JX-test-passphrase-2026");
  await page.locator("#unlock").click();
  await expect(page.locator("#gate")).toHaveClass(/hidden/);
});

test("AI council builds a provider-neutral packet without claiming live model calls", async ({ page }) => {
  await page.locator('[data-section="council"]').click();
  await page.locator("#task").fill("Audit the release for regressions");
  await page.locator("#constraints").fill("Read-only first; no merge");
  await page.locator("#build-council").click();
  await expect(page.locator("#council-output")).toContainText("jarvis-x-task-packet");
  await expect(page.locator("#council-status")).toContainText("No model was called");
  await page.locator("#data-class").selectOption("sensitive");
  await page.locator("#build-council").click();
  await expect(page.locator("#council-status")).toContainText("handoff is blocked");
});

test("portable handoff exports and rejects malformed imports", async ({ page }) => {
  await page.locator('[data-section="bridge"]').click();
  await page.locator("#bridge-objective").fill("Continue the verified audit");
  await page.locator("#bridge-evidence").fill("CI green; live providers unconnected.");
  await page.locator("#build-bridge").click();
  await expect(page.locator("#bridge-output")).toContainText("jarvis-x-portable-handoff");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-bridge").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("jarvis-x-portable-handoff.json");
  await page.locator("#bridge-import").setInputFiles({
    name: "invalid.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "other", version: 1, objective: "bad" })),
  });
  await expect(page.locator("#bridge-status")).toContainText("Import rejected");
});

test("workflow designer stores a checklist but never claims remote execution", async ({ page }) => {
  await page.locator('[data-section="workflows"]').click();
  await page.locator("#workflow-name").fill("Release verification");
  await page.locator("#workflow-steps").fill("Inspect SHA\nRun tests\nVerify deployment");
  await page.locator("#create-workflow").click();
  await expect(page.locator("#workflow-list")).toContainText("Release verification");
  await expect(page.locator("#workflow-status")).toContainText("No remote jobs were executed");
  await page.reload();
  await expect(page.locator("#gate")).not.toHaveClass(/hidden/);
  await page.locator("#unlock-pass").fill("JX-test-passphrase-2026");
  await page.locator("#unlock").click();
  await page.locator('[data-section="workflows"]').click();
  await expect(page.locator("#workflow-list")).toContainText("Release verification");
});

test("security panel reports browser facts without pretending to scan malware", async ({ page }) => {
  await page.locator('[data-section="security"]').click();
  await page.locator("#run-security").click();
  await expect(page.locator("#security-results")).toContainText("OS malware scanning");
  await expect(page.locator("#security-status")).toContainText("No malware scan");
});

test("image studio prepares a brief without claiming an asset was generated", async ({ page }) => {
  await page.locator('[data-section="image"]').click();
  await page.locator("#image-subject").fill("A cinematic futuristic command room");
  await page.locator("#build-image").click();
  await expect(page.locator("#image-output")).toContainText("Art direction");
  await expect(page.locator("#image-status")).toContainText("No image asset has been generated");
});

test("Mission Control navigation and mobile viewport remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-section="bridge"]').click();
  await expect(page.locator("#section-bridge")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
