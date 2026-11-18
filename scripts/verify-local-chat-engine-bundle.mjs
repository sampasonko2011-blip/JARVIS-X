import { readFile } from "node:fs/promises";
const bundle = await readFile(new URL("../hq/local-chat-engine.bundle.js", import.meta.url), "utf8");
const required = ["Qwen2.5-3B-Instruct-q4f16_1-MLC","Phi-3.5-mini-instruct-q4f16_1-MLC","gemma-2-2b-it-q4f16_1-MLC","Qwen2.5-1.5B-Instruct-q4f16_1-MLC","prebuiltAppConfig","model_list"];
const missing = required.filter(token => !bundle.includes(token));
if (missing.length) throw new Error("Local chat bundle is stale or incomplete; missing: " + missing.join(", "));
console.log("Verified rebuilt local chat bundle: requested model IDs and explicit WebLLM catalog are present.");
