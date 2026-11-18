import test from "node:test";
import assert from "node:assert/strict";
import { prebuiltAppConfig } from "@mlc-ai/web-llm";
test("v50 requested model IDs exist in the pinned WebLLM prebuilt catalog", () => {
 const ids = new Set(prebuiltAppConfig.model_list.map(entry => entry.model_id));
 for (const id of ["Qwen2.5-3B-Instruct-q4f16_1-MLC","Phi-3.5-mini-instruct-q4f16_1-MLC","gemma-2-2b-it-q4f16_1-MLC","Qwen2.5-1.5B-Instruct-q4f16_1-MLC"]) assert.ok(ids.has(id), "missing WebLLM model ID: " + id);
});
