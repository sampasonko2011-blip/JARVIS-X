import test from "node:test";
import assert from "node:assert/strict";
import { createAgentRuntime, validateAgentRegistry } from "../evaluation/agent-runtime.mjs";
const agent = (overrides = {}) => ({ id:"repo-verifier",kind:"verification-agent",roles:["critique"],activation:"ENABLED",status:"VALIDATED",independenceGroup:"operator-test",allowedTools:["inspect_diff","read_test_results"],dataAccessScope:"selected-diff-only",...overrides });
const registry = (...agents) => ({ agents });
test("registry rejects duplicate IDs, unassigned independence and unknown tools", () => {
 const result=validateAgentRegistry(registry(agent(),agent(),agent({id:"bad-tool",allowedTools:["shell_exec"]}),agent({id:"unassigned",independenceGroup:"unassigned-operator"})));
 assert.equal(result.valid,false); assert.ok(result.errors.some(x=>x.startsWith("DUPLICATE_AGENT_ID"))); assert.ok(result.errors.some(x=>x.startsWith("INVALID_TOOL_ALLOWLIST"))); assert.ok(result.errors.some(x=>x.startsWith("INDEPENDENCE_UNVERIFIED")));
});
test("disabled agents cannot execute",async()=>{const runtime=createAgentRuntime({registry:registry(agent({activation:"DISABLED"}))});await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"inspect_diff"}}),/disabled/);});
test("execution requires allowlisted tool, trusted handler and explicit authorization",async()=>{let calls=0;const runtime=createAgentRuntime({registry:registry(agent()),handlers:{inspect_diff:async()=>{calls++;return {verified:true};}},authorize:async()=>false});await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"inspect_diff"}}),/Authorization denied/);await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"shell_exec"}}),/outside agent allowlist/);assert.equal(calls,0);});
test("trusted host handler runs only after authorization and records verification status",async()=>{let calls=0;const runtime=createAgentRuntime({registry:registry(agent()),handlers:{inspect_diff:async({objective,dataAccessScope})=>{calls++;return {objective,dataAccessScope,verified:true};}},authorize:async({agentId,tool,dataAccessScope})=>agentId==="repo-verifier"&&tool==="inspect_diff"&&dataAccessScope==="selected-diff-only",verify:async(result)=>result.verified===true});const result=await runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"review patch",tool:"inspect_diff"}});assert.equal(calls,1);assert.equal(result.evidence.verified,true);assert.equal(runtime.audit().length,1);});
test("failed verification remains UNPROVEN",async()=>{const runtime=createAgentRuntime({registry:registry(agent()),handlers:{inspect_diff:async()=>({findings:["maybe"]})},authorize:async()=>true,verify:async()=>false});const result=await runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"inspect_diff"}});assert.equal(result.evidence.status,"UNPROVEN");assert.equal(result.evidence.verified,false);});


test("handler self-asserted verified flag is not trusted by the default verifier",async()=>{
 const runtime=createAgentRuntime({registry:registry(agent()),handlers:{inspect_diff:async()=>({verified:true,claim:"self-attested"})},authorize:async()=>true});
 const result=await runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"inspect_diff"}});
 assert.equal(result.evidence.status,"UNPROVEN");
 assert.equal(result.evidence.verified,false);
 assert.equal(runtime.audit()[0].status,"UNPROVEN");
});

test("independent verifier can validate output; handler failures remain in the audit ledger",async()=>{
 const passing=createAgentRuntime({registry:registry(agent()),handlers:{inspect_diff:async()=>({finding:"supported"})},authorize:async()=>true,verify:async(result)=>result.finding==="supported"});
 const accepted=await passing.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"inspect_diff"}});
 assert.equal(accepted.evidence.status,"VALIDATED");
 const failing=createAgentRuntime({registry:registry(agent()),handlers:{inspect_diff:async()=>{throw new Error("sandbox unavailable");}},authorize:async()=>true});
 await assert.rejects(failing.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"inspect_diff"}}),/sandbox unavailable/);
 assert.equal(failing.audit()[0].status,"REJECTED");
 assert.equal(failing.audit()[0].failure,"sandbox unavailable");
});


test("runtime snapshots and freezes registry so post-construction mutation cannot grant execution",async()=>{
 const source=registry(agent({activation:"DISABLED"}));
 const runtime=createAgentRuntime({registry:source,handlers:{inspect_diff:async()=>({ok:true})},authorize:async()=>true});
 source.agents[0].activation="ENABLED";
 source.agents[0].allowedTools.push("read_public_web");
 await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"try escalation",tool:"inspect_diff"}}),/disabled/);
 assert.equal(runtime.list()[0].activation,"DISABLED");
});
