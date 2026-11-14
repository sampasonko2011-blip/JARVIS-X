import { test, expect } from "@playwright/test";
test("v31 dock opens modules and persists touch-friendly move and resize", async ({ page }) => {
 await page.goto("/observatory.html");
 await page.evaluate(()=>localStorage.clear());
 await page.reload();
 await page.locator("#skip-boot").click();
 await page.locator(".dock [data-v29-add='chat']").click();
 const panel=page.locator(".v29-panel[data-type='chat']");
 await expect(panel).toBeVisible();
 const move=panel.locator(".v29-handle");
 const before=await panel.boundingBox();
 await move.scrollIntoViewIfNeeded();
 const mb=await move.boundingBox();
 await page.mouse.move(mb.x+mb.width/2,mb.y+mb.height/2);
 await page.mouse.down(); await page.mouse.move(mb.x+mb.width/2+65,mb.y+mb.height/2+45); await page.mouse.up();
 await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem("jarvis_x_v31_panel_geometry")||"{}").chat?.left)).toBeGreaterThan(before.x);
 const rb=await panel.locator(".jx-v31-resize").boundingBox();
 const sizeBefore=await panel.boundingBox();
 await page.mouse.move(rb.x+rb.width/2,rb.y+rb.height/2); await page.mouse.down();
 await page.mouse.move(rb.x+rb.width/2+55,rb.y+rb.height/2+40); await page.mouse.up();
 await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem("jarvis_x_v31_panel_geometry")||"{}").chat?.width)).toBeGreaterThan(sizeBefore.width);
 await page.reload(); await page.locator("#skip-boot").click();
 await page.locator(".dock [data-v29-add='chat']").click();
 await expect.poll(async()=>page.locator(".v29-panel[data-type='chat']").evaluate(n=>getComputedStyle(n).width)).toContain("px");
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("jarvis_x_v31_panel_geometry")||"{}").chat);
 expect(saved.width).toBeGreaterThan(sizeBefore.width);
});
test("v31 service worker and clean shell are wired", async ({ page }) => {
 await page.goto("/observatory.html");
 const shell=await page.locator("main.cockpit").innerHTML();
 expect(shell).not.toContain("wing-left");
 expect(shell).not.toContain("SYNAPTIC TELEMETRY");
 expect(await page.locator('link[href="./interstellar-v31.css"]').count()).toBe(1);
 expect(await page.locator('script[src="./observatory-v31.js"]').count()).toBe(1);
 const sw=await page.request.get("/sw.js"); expect(await sw.text()).toContain("jarvis-x-hq-shell-v33");
});
test("every bottom dock control is interactive and opens its matching module", async ({ page }) => {
 await page.setViewportSize({width:820,height:1180});
 await page.goto("/observatory.html");
 await page.evaluate(()=>localStorage.clear());
 await page.reload();
 await page.locator("#skip-boot").click();
 const plus=page.locator(".dock #v29-open");
 await plus.click();
 await expect(page.locator("#v29-launcher")).toHaveClass(/open/);
 await page.locator("#v29-close").click();
 const modules=["chat","agents","briefs","vault","prompts","image","recovery","telemetry"];
 for (const type of modules) {
   const control=page.locator(`.dock [data-v29-add="${type}"]`);
   await expect(control).toBeVisible();
   await control.click();
   await expect(page.locator(`.v29-panel[data-type="${type}"]`)).toBeVisible();
 }
 await expect(page.locator(".v29-panel")).toHaveCount(modules.length);
 await expect(page.locator('.dock a[href="./observatory.html"]')).toBeVisible();
 await expect(page.locator('.dock a[href="./local-chat.html"]')).toBeVisible();
});
