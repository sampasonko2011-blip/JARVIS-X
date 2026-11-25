import { test, expect } from "@playwright/test";

test("P5 local outbox view is explicit about local-only storage and no automatic sync", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: /Offline & evolution/i }).click();
  await expect(page.locator("#view-p5")).toBeVisible();
  await expect(page.locator("#p5-network-status")).toContainText("NO AUTO-SEND");
  await expect(page.locator("#view-p5")).toContainText("AES-GCM");
  await expect(page.locator("#view-p5")).toContainText("non-extractable");
  await expect(page.locator("#view-p5")).toContainText("not sent anywhere");
});

test("P5 outbox accepts a local non-sensitive JSON mutation and exports state", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: /Offline & evolution/i }).click();
  await page.locator("#p5-payload").fill('{"title":"E2E offline note","body":"non-sensitive fixture"}');
  await page.locator("#p5-enqueue").click();
  await expect(page.locator("#p5-message")).toContainText("Saved locally as PENDING");
  await expect(page.locator("#p5-pending-count")).toHaveText("1");
  await expect(page.locator("#p5-outbox")).toContainText("memory.note");
  const stored = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open("jarvis-x-p5", 3); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const rows = await new Promise((resolve, reject) => { const tx = db.transaction("outbox", "readonly"); const req = tx.objectStore("outbox").getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    db.close(); return rows;
  });
  expect(stored).toHaveLength(1);
  expect(stored[0]).toHaveProperty("payloadCiphertext");
  expect(stored[0]).toHaveProperty("payloadIv");
  expect(stored[0]).not.toHaveProperty("payload");
});

test("authenticated PRONOTE snapshot and HQ memory events enter encrypted CRDT outbox", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: /Offline & evolution/i }).click();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("jx:pronote-snapshot", { detail: {
      schema_version: "pronote.snapshot.v1",
      snapshot_hash: "e2e-snapshot-hash-0001",
      generated_at: "2026-11-25T10:00:00Z",
      snapshot: { events: [{ id: "lesson-1", kind: "lesson", summary: "Mathématiques", start: "2026-11-26T08:00:00Z" }] }
    }}));
  });
  await expect(page.locator("#p5-message")).toContainText("Authenticated PRONOTE snapshot encrypted and queued locally.");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("jx:memory-mutation", { detail: {
    id: "e2e-memory-note-0001", title: "Study note", body: "Offline memory fixture", time: "2026-11-25T10:01:00Z"
  }})));
  await expect(page.locator("#p5-message")).toContainText("HQ memory change encrypted and queued locally.");
  const decoded = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open("jarvis-x-p5", 3); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const tx = db.transaction(["outbox", "crypto_keys"], "readonly");
    const rowsRequest = tx.objectStore("outbox").getAll();
    const keyRequest = tx.objectStore("crypto_keys").get("payload-aes-gcm-v1");
    const [rows, keyRow] = await Promise.all([
      new Promise((resolve, reject) => { rowsRequest.onsuccess = () => resolve(rowsRequest.result); rowsRequest.onerror = () => reject(rowsRequest.error); }),
      new Promise((resolve, reject) => { keyRequest.onsuccess = () => resolve(keyRequest.result); keyRequest.onerror = () => reject(keyRequest.error); })
    ]);
    const values = [];
    for (const row of rows) {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(row.payloadIv) }, keyRow.key, row.payloadCiphertext);
      values.push({ type: row.type, payload: JSON.parse(new TextDecoder().decode(plain)), hasPlaintext: Object.hasOwn(row, "payload") });
    }
    db.close(); return values;
  });
  expect(decoded.map(row => row.type)).toEqual(["pronote.snapshot.crdt", "memory.note.crdt"]);
  expect(decoded.every(row => !row.hasPlaintext)).toBe(true);
  expect(decoded[0].payload.crdt.adds.length).toBe(1);
  expect(decoded[1].payload.crdt.adds.length).toBe(1);
});
