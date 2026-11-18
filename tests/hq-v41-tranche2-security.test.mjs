import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("v41 Inspector contains local agent factory, approval queue, rollback and honest provider status",async()=>{
 const page=await read("../hq/local-chat.html"), brain=await read("../hq/jarvis-brain-v36.js"), engine=await read("../hq/local-chat-engine.js");
 for(const id of ["jx-agent-form","jx-agent-select","jx-agent-select-chat","jx-upgrade-form","jx-upgrade-proposals","jx-provider-status","jx-provider-alert","jx-xmemo-sync-status"]) assert.ok(page.includes('id="'+id+'"'),id);
 for(const token of ["APPROUVER & ASSIMILER","REJETER","ROLLBACK","iterations","maxIterations:3","jarvis_x_custom_agents","jarvis_x_upgrade_proposals"]) assert.ok(brain.includes(token),token);
 assert.match(brain,/a\.length>=12/);
 assert.match(brain,/x\.iterations>=3/);
 assert.match(brain,/local-model-only/);
 assert.match(engine,/LOCAL M1 · ACTIVE · NO CLOUD PROVIDER ATTEMPTED/);
 assert.doesNotMatch(engine,/providerCascade|invokeProviderCascade|OPENROUTER_API_KEY|GEMINI_API_KEY/);
});

test("v41 local Inspector uses DOM text nodes and no inline style/script attributes",async()=>{
 const page=await read("../hq/local-chat.html"),brain=await read("../hq/jarvis-brain-v36.js"),css=await read("../hq/local-chat-v34.css");
 assert.doesNotMatch(page,/<script[^>]*>[^<]/i);
 assert.doesNotMatch(page,/\sstyle\s*=/i);
 assert.doesNotMatch(page,/\son[a-z]+\s*=/i);
 assert.match(page,/style-src 'self'/);
 assert.doesNotMatch(page,/unsafe-inline/);
 assert.match(brain,/textContent=/);
 assert.doesNotMatch(brain,/innerHTML\s*=/);
 assert.match(css,/jx-governance-panel/);
});

test("v41 server provider endpoints are fixed constants and routing remains doubly opt-in",async()=>{
 const provider=await read("../supabase/functions/hq-gateway-v12/provider-cascade.mjs");
 const gateway=await read("../supabase/functions/hq-gateway-v12/index.ts");
 assert.match(provider,/JX_ENABLE_PROVIDER_CASCADE/);
 for(const flag of ["JX_PROVIDER_OPENROUTER_ENABLED","JX_PROVIDER_GEMINI_ENABLED","JX_PROVIDER_GROQ_ENABLED","JX_PROVIDER_CEREBRAS_ENABLED","JX_PROVIDER_NVIDIA_ENABLED","JX_PROVIDER_SAMBANOVA_ENABLED","JX_PROVIDER_MISTRAL_ENABLED","JX_PROVIDER_GITHUB_MODELS_ENABLED"]) assert.ok(provider.includes(flag),flag);
 assert.match(provider,/new Set\(\[402, 429\]\)/);
 assert.match(provider,/AbortSignal\.timeout/);
 assert.match(provider,/provider\.endpoint/);
 assert.match(gateway,/Deno\.env\.get\("LIVE_INFERENCE_ENABLED"\) === "true"/);
 assert.match(gateway,/JX_ENABLE_PROVIDER_CASCADE === "true"/);
 assert.match(gateway,/authenticatedUser\(/);
 assert.match(gateway,/consume_hq_rate_limit/);
 assert.match(gateway,/JX_ALLOWED_EMAILS/);
 assert.doesNotMatch(provider,/fetchImpl\(env\.|new URL\(env\.|endpoint:\s*env\./);
});

test("v41 XMemo memory is per-turn consent-gated, authenticated, allowlisted and database-rate-limited",async()=>{
 const page=await read("../hq/local-chat.html"),engine=await read("../hq/local-chat-engine.js");
 const bridge=await read("../hq/local-memory-bridge.js"),memory=await read("../supabase/functions/hq-memory-v1/index.ts");
 const handler=await read("../supabase/functions/hq-memory-v1/memory-gateway.mjs");
 assert.match(page,/Allow memory recall and save for this turn/);
 assert.match(engine,/memoryConsent\?\.checked === true/);
 assert.match(engine,/memoryConsent\.checked = false/);
 assert.match(bridge,/Authorization: "Bearer " \+ token/);
 assert.match(bridge,/memory_consent: true/);
 assert.match(memory,/authenticate/);
 assert.match(memory,/consumeRateLimit/);
 assert.match(handler,/body\.memory_consent !== true/);
 assert.match(handler,/emailAllowlist\.size === 0/);
 assert.match(handler,/consumeRateLimit\(user\.id, "minute"/);
 assert.match(handler,/consumeRateLimit\(user\.id, "day"/);
 assert.match(handler,/context_is_untrusted: true/);
 assert.match(bridge,/DEFAULT_PUBLISHABLE_KEY/);
 assert.doesNotMatch(bridge,/service_role|OPENROUTER_API_KEY|GEMINI_API_KEY|GROQ_API_KEY/);
});

test("v41 service worker caches the Inspector UI and local cognitive router under v42",async()=>{
 const sw=await read("../hq/sw.js");
 assert.match(sw,/jarvis-x-hq-shell-v47/);
 assert.match(sw,/local-chat\.html/);
 assert.match(sw,/local-chat-engine\.bundle\.js/);
 assert.match(sw,/jarvis-brain-v36\.js/);
});
