import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Mission Control uses a same-origin external script and restrictive script CSP", async () => {
  const html = await readFile(new URL("../hq/mission-control.html", import.meta.url), "utf8");
  assert.match(html, /script-src 'self';/);
  assert.match(html, /src="\.\/mission-control\.js" defer/);
  assert.doesNotMatch(html, /<script>\s*const \$=/);
});

test("Mission Control presents one JARVIS-X identity and never exposes API key inputs", async () => {
  const html = await readFile(new URL("../hq/mission-control.html", import.meta.url), "utf8");
  const js = await readFile(new URL("../hq/mission-control.js", import.meta.url), "utf8");
  assert.match(html, /JARVIS-X gateway: not verified/);
  assert.match(html, /Remote sync: not connected/);
  assert.match(html, /Defence API/);
  assert.match(html, /Single-identity contract/);
  assert.doesNotMatch(html, /providers-select|Provider roster|href="https:\/\/(?:chatgpt\.com|claude\.ai|gemini\.google\.com)\//i);
  assert.doesNotMatch(html, /type=["']password["'][^>]*(?:api|secret)|(?:api|secret)[^>]*type=["']password["']/i);
  assert.match(js, /No model was called/);
  assert.match(js, /No remote jobs were executed/);
  assert.match(js, /No malware scan or remote threat detection was performed/);
});

test("cross-platform import requires the explicit packet schema and rejects secret-like patterns", async () => {
  const js = await readFile(new URL("../hq/mission-control.js", import.meta.url), "utf8");
  assert.match(js, /jarvis-x-portable-handoff/);
  assert.match(js, /Unsupported or unsafe packet schema/);
  assert.match(js, /Possible secret pattern detected/);
  assert.match(js, /receiving_agent_must_revalidate_permissions/);
  assert.match(js, /Do not assume shared memory, sessions, credentials or provider access/);
});

test("sensitive council tasks are blocked from external handoff and workflow queue is explicitly local", async () => {
  const js = await readFile(new URL("../hq/mission-control.js", import.meta.url), "utf8");
  assert.match(js, /dataClass==="sensitive"/);
  assert.match(js, /Sensitive data selected: export\/handoff is blocked/);
  assert.match(js, /Workflow saved locally\. No remote jobs were executed/);
  assert.match(js, /Local browser checks completed\. No malware scan or remote threat detection was performed/);
});
