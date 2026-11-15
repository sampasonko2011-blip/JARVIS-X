import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("v42 loads its external Stark Command Studio assets and service-worker cache",async()=>{
 const html=await read("../hq/local-chat.html"),sw=await read("../hq/sw.js");
 assert.match(html,/local-chat-v42\.css/);
 assert.match(html,/local-chat-v42\.js/);
 assert.match(sw,/jarvis-x-hq-shell-v42/);
 assert.match(sw,/local-chat-v42\.css/);
 assert.match(sw,/local-chat-v42\.js/);
});

test("v42 preserves v41 model, memory, agent and upgrade hooks",async()=>{
 const html=await read("../hq/local-chat.html"),brain=await read("../hq/jarvis-brain-v36.js"),js=await read("../hq/local-chat-v42.js");
 for(const id of ["model-select","load-model","runtime-status","message","send-message","voice-dictation","local-memory-consent","jx-agent-form","jx-upgrade-form","jx-upgrade-proposals","jx-provider-status","jx-xmemo-sync-status"])assert.ok(html.includes('id="'+id+'"'),id);
 for(const token of ["jarvis_x_custom_agents","jarvis_x_upgrade_proposals","approveProposal","rejectProposal","rollbackProposal"])assert.ok(brain.includes(token),token);
 for(const token of ["jx42-engine-modal","jx42-memory-modal","jx42-upgrade-modal","jx42-agent-modal","jx42-dock","jx42-agent-strip","refreshCount","openModal"])assert.ok(js.includes(token)|| (token==="100dvh"&&true),token);
});

test("v42 uses external CSS and creates no inline style or event handlers",async()=>{
 const html=await read("../hq/local-chat.html"),css=await read("../hq/local-chat-v42.css"),js=await read("../hq/local-chat-v42.js");
 assert.doesNotMatch(html,/\sstyle\s*=/i);
 assert.doesNotMatch(html,/\son[a-z]+\s*=/i);
 assert.match(html,/style-src 'self'/);
 assert.doesNotMatch(html,/unsafe-inline/);
 assert.doesNotMatch(css,/style\s*=/i);
 assert.doesNotMatch(js,/\.style\s*\./);
 assert.match(css,/overflow:hidden!important/);
 assert.match(css,/100dvh/);
 assert.match(css,/#transcript[\s\S]*overflow-y:auto/);
});

test("v42 command dock preserves original composer nodes and native model loading",async()=>{
 const js=await read("../hq/local-chat-v42.js"),engine=await read("../hq/local-chat-engine.js");
 assert.match(js,/composer\.append\(message\)/);
 assert.match(js,/composer\.append\(actions\)/);
 assert.match(js,/engineModal\.body\.append\(modelRail\)/);
 assert.match(engine,/CreateMLCEngine\(selectedModel/);
 assert.match(engine,/memoryConsent\?\.checked === true/);
});
