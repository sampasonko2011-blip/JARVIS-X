import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, "../index.html"), "utf8");
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, "inline application script exists");
new vm.Script(match[1], { filename: "apex-career-os.js" });

for (const page of [
  "dashboard", "opportunities", "dossier", "evidence", "contacts", "outreach",
  "tasks", "activity", "readiness", "team", "budget", "audit", "settings"
]) {
  assert.ok(html.includes('data-page="' + page + '"'), "navigation exists for " + page);
}
for (const phrase of [
  "Export all data (JSON)", "Import a previous Apex JSON export",
  "Delete all local records", "Preview club-ready pack", "Manual release gates",
  "Activity log", "Guardian review"
]) {
  assert.ok(html.includes(phrase), "expected capability text exists: " + phrase);
}
assert.ok(html.includes("localStorage"), "local persistence is explicitly implemented");
assert.ok(html.includes("No messages are sent"), "integration limitations are disclosed");
assert.ok(!html.includes("addEventListener('click',e=>{let b=e.target.closest('[data-new],[data-edit],[data-goto],[data-pack]')"),
  "duplicate delegated click handler is absent");
console.log("PASS: JavaScript syntax");
console.log("PASS: 13 navigation destinations");
console.log("PASS: key workflow/source disclosures");
console.log("NOTE: static checks only; browser interaction, persistence and security are not certified.");
