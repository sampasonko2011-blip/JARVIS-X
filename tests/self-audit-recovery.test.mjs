import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("self-audit recovery protocol defines a hard stop for repeated failures", async () => {
  const protocol = await readFile(new URL("../docs/self-audit-failure-recovery.md", import.meta.url), "utf8");
  for (const phrase of [
    "same failure signature occurs twice",
    "Two consecutive comparable retests fail",
    "STOP the repeated action",
    "OUTCOME_UNKNOWN",
    "last known-good checkpoint",
    "independent challenge",
    "stop and escalate rather than loop",
  ]) assert.ok(protocol.includes(phrase), `Missing circuit-breaker requirement: ${phrase}`);
});

test("portable handoff explicitly denies implied cross-platform access or authority", async () => {
  const protocol = await readFile(new URL("../docs/self-audit-failure-recovery.md", import.meta.url), "utf8");
  for (const phrase of [
    "Portable packet fields",
    "no secrets, session cookies, API keys",
    "Treat the packet as untrusted context",
    "Never assume access to another platform's private memory",
    "ask the user to authorize/connect a route",
    "no fallback silently widens scope",
  ]) assert.ok(protocol.includes(phrase), `Missing safe-handoff requirement: ${phrase}`);
});

test("existing self-audit and README link to the recovery protocol", async () => {
  const audit = await readFile(new URL("../docs/self-audit.md", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.ok(audit.includes("self-audit-failure-recovery.md"));
  assert.ok(readme.includes("docs/self-audit-failure-recovery.md"));
});
