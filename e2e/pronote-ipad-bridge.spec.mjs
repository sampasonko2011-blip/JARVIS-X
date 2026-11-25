import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => sessionStorage.setItem("jx-auth-session", JSON.stringify({
    access_token: "fixture-access-token", refresh_token: "fixture-refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600
  })));
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator('.side .nav [data-view="workspace"]').click();
});

test("PRONOTE bridge token UI creates once, copies and revokes through authenticated endpoints", async ({ page }) => {
  let created = false, revoked = false;
  await page.route("**/functions/v1/pronote-ipad-bridge/token", async route => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers()["authorization"]).toContain("Bearer fixture-access-token");
    created = true;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
      token: "one-time-test-token", token_id: "00000000-0000-4000-8000-000000000001",
      expires_at: "2027-02-23T00:00:00.000Z"
    }) });
  });
  await page.route("**/functions/v1/pronote-ipad-bridge/token/revoke", async route => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(JSON.parse(request.postData()).token_id).toBe("00000000-0000-4000-8000-000000000001");
    revoked = true;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revoked: true }) });
  });
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#pronote-token-create").click();
  await expect(page.locator("#pronote-token-value")).toHaveValue("one-time-test-token");
  await expect(page.locator("#pronote-token-status")).toContainText("Token created");
  expect(created).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("one-time-test-token"))).toBeNull();

  page.once("dialog", dialog => dialog.accept());
  await page.locator("#pronote-token-revoke").click();
  await expect(page.locator("#pronote-token-status")).toContainText("Token revoked");
  await expect(page.locator("#pronote-token-value")).toHaveValue("");
  expect(revoked).toBe(true);
});

test("Workspace reads only the signed-in user's stored PRONOTE snapshot and renders inert event text", async ({ page }) => {
  await page.route("**/rest/v1/pronote_ipad_snapshots*", async route => {
    expect(route.request().headers()["authorization"]).toContain("Bearer fixture-access-token");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
      schema_version: "pronote.snapshot.v1",
      generated_at: new Date().toISOString(),
      received_at: new Date().toISOString(),
      snapshot_hash: "a".repeat(64),
      event_count: 1,
      snapshot: { schemaVersion: "pronote.snapshot.v1", events: [{
        uid: "realish-fixture", summary: "<img src=x onerror=alert(1)> Algebra homework",
        kind: "homework", start: "2026-11-26T10:00:00.000Z", end: "2026-11-26T11:00:00.000Z"
      }] }
    }]) });
  });
  await page.locator("#pronote-snapshot-refresh").click();
  await expect(page.locator("#pronote-snapshot-status")).toContainText("FRESH");
  await expect(page.locator("#pronote-snapshot-status")).toContainText("1 events");
  await expect(page.locator("#pronote-snapshot-events")).toContainText("Algebra homework");
  await expect(page.locator("#pronote-snapshot-events img")).toHaveCount(0);
});
