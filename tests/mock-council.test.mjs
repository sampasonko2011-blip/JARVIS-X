import test from "node:test";
import assert from "node:assert/strict";
import { createMockCouncilResult } from "../supabase/functions/hq-gateway/mock-council.mjs";

test("mock council simulates five stages and declares zero provider calls", () => {
  const result = createMockCouncilResult();
  assert.equal(result.providersUsed.length, 5);
  assert.deepEqual(result.providersUsed.map((stage) => stage.stage), [
    "lead_solver", "reasoning_review", "critical_review", "adversarial_review", "final_synthesis",
  ]);
  assert.equal(result.providerCalls, 0);
  assert.match(result.answer, /no real AI inference/i);
  assert.ok(result.providersUsed.every((stage) => stage.provider === "mock"));
});

test("mock result is deterministic and does not echo input", () => {
  assert.deepEqual(createMockCouncilResult(), createMockCouncilResult());
  assert.doesNotMatch(createMockCouncilResult().answer, /OPENAI_API_KEY|DEEPSEEK_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY|GOOGLE_API_KEY/);
});

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

test("gateway mock route is explicit, opt-in, and fails closed without provider fallback", async () => {
  const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "../supabase/functions/hq-gateway/index.ts");
  const source = await readFile(sourcePath, "utf8");
  const mockStart = source.indexOf('if (body.mode === "mock")');
  const mockEnd = source.indexOf('const missingProviderSecrets =', mockStart);
  assert.ok(mockStart >= 0 && mockEnd > mockStart, "mock route must precede live provider-secret handling");
  const mockRoute = source.slice(mockStart, mockEnd);
  assert.match(mockRoute, /Deno\\.env\\.get\\("JX_ENABLE_MOCK_MODE"\\)\\s*!== "true"/);
  assert.match(mockRoute, /mock_mode_disabled/);
  assert.match(mockRoute, /createMockCouncilResult\(\)/);
  assert.match(mockRoute, /provider_calls: 0/);
  assert.doesNotMatch(mockRoute, /fetch\s*\(/, "mock route must not make network calls directly");
  assert.match(mockRoute, /audit_logging_failed/);
});
