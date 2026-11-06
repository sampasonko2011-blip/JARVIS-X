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
test("execution requires allowlisted tool, trusted handler and explicit authorization",async()=>{let calls=0;const runtime=createAgentRuntime({registry:registry(agent()),handlers:{inspect_diff:async()=>{calls++;return {verified:true};}},authorize:async()=>false});await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"inspect_diff"}}),/Authorization denied/);await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"review",tool:"shell_exec"}}),/outside agent allowlist/);assert.equal(calls,0);assert.equal(runtime.audit()[0].authorized,false);assert.equal(runtime.audit()[0].executed,false);});
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


test("concurrency limit rejects excess work and audit records denied attempts",async()=>{
 let release;
 const runtime=createAgentRuntime({registry:registry(agent()),maxConcurrent:1,handlers:{inspect_diff:async()=>new Promise(resolve=>{release=()=>resolve({ok:true});})},authorize:async()=>true});
 const first=runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"first",tool:"inspect_diff"}});
 await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"second",tool:"inspect_diff"}}),/CONCURRENCY_LIMIT/);
 release(); await first;
 assert.equal(runtime.audit().length,2);
 assert.equal(runtime.audit()[1].status,"REJECTED");
});

test("handler receives abort signal and timeout is audited",async()=>{
 const runtime=createAgentRuntime({registry:registry(agent()),timeoutMs:100,handlers:{inspect_diff:async({signal})=>new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("cooperative abort")),{once:true}))},authorize:async()=>true});
 await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"bounded",tool:"inspect_diff"}}),/AGENT_TIMEOUT/);
 assert.equal(runtime.audit()[0].status,"REJECTED");
 assert.equal(runtime.audit()[0].failure,"AGENT_TIMEOUT");
});


test("late handler completion after caller cancellation cannot be verified as success",async()=>{
 let finish;
 const controller=new AbortController();
 const runtime=createAgentRuntime({registry:registry(agent()),handlers:{inspect_diff:async()=>new Promise(resolve=>{finish=()=>resolve({verified:true});})},authorize:async()=>true,verify:async()=>true});
 const pending=runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"cancel",tool:"inspect_diff"},signal:controller.signal});
 await new Promise(resolve=>setImmediate(resolve));
 controller.abort(new Error("caller cancelled"));
 finish();
 await assert.rejects(pending,/AGENT_INVOCATION_ABORTED/);
 assert.equal(runtime.audit()[0].status,"REJECTED");
 assert.equal(runtime.audit()[0].verified,false);
});


test("public validation snapshot cannot mutate the runtime policy",async()=>{
 const runtime=createAgentRuntime({registry:registry(agent({activation:"DISABLED"}))});
 const exposed=runtime.validation;
 exposed.valid=true;
 exposed.errors.push("caller mutation");
 await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"must stay disabled",tool:"inspect_diff"}}),/disabled/);
 assert.equal(runtime.validation.valid,true);
 assert.deepEqual(runtime.validation.errors,[]);
});

test("audit retention is bounded and task objective size is capped",async()=>{
 const runtime=createAgentRuntime({registry:registry(agent()),maxAuditEntries:10,handlers:{inspect_diff:async()=>({ok:true})},authorize:async()=>true});
 await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"x".repeat(8001),tool:"inspect_diff"}}),/8000-character/);
 for(let i=0;i<12;i++) await runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"audit "+i,tool:"inspect_diff"}});
 assert.equal(runtime.audit().length,10);
 assert.equal(runtime.audit()[0].executed,true);
});


test("authorization is deadline-bounded and a timed-out authorizer cannot start a handler",async()=>{
 let calls=0;
 const runtime=createAgentRuntime({registry:registry(agent()),timeoutMs:100,authorize:async()=>new Promise(()=>{}),handlers:{inspect_diff:async()=>{calls++;return {ok:true};}}});
 await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"auth timeout",tool:"inspect_diff"}}),/AGENT_TIMEOUT/);
 assert.equal(calls,0);
 assert.equal(runtime.audit()[0].authorized,false);
 assert.equal(runtime.audit()[0].executed,false);
});

test("independent verification is deadline-bounded and remains unvalidated on timeout",async()=>{
 const runtime=createAgentRuntime({registry:registry(agent()),timeoutMs:100,handlers:{inspect_diff:async()=>({finding:"done"})},authorize:async()=>true,verify:async()=>new Promise(()=>{})});
 await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"verify timeout",tool:"inspect_diff"}}),/AGENT_TIMEOUT/);
 assert.equal(runtime.audit()[0].status,"REJECTED");
 assert.equal(runtime.audit()[0].verified,false);
});


test("caller cancellation interrupts a pending handler immediately and retains rejection evidence",async()=>{
 let started;
 const began=new Promise(resolve=>{started=resolve;});
 const controller=new AbortController();
 const runtime=createAgentRuntime({registry:registry(agent()),timeoutMs:5000,handlers:{inspect_diff:async()=>{started();return new Promise(()=>{});}},authorize:async()=>true});
 const pending=runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"cancel promptly",tool:"inspect_diff"},signal:controller.signal});
 await began;
 controller.abort(new Error("user cancelled"));
 await assert.rejects(pending,/AGENT_INVOCATION_ABORTED/);
 assert.equal(runtime.audit()[0].status,"REJECTED");
 assert.equal(runtime.audit()[0].failure,"AGENT_INVOCATION_ABORTED");
});

test("caller cancellation interrupts pending authorization before handler execution",async()=>{
 let started,calls=0;
 const began=new Promise(resolve=>{started=resolve;});
 const controller=new AbortController();
 const runtime=createAgentRuntime({registry:registry(agent()),timeoutMs:5000,authorize:async()=>{started();return new Promise(()=>{});},handlers:{inspect_diff:async()=>{calls++;return {ok:true};}}});
 const pending=runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"cancel authorization",tool:"inspect_diff"},signal:controller.signal});
 await began;
 controller.abort();
 await assert.rejects(pending,/AGENT_INVOCATION_ABORTED/);
 assert.equal(calls,0);
 assert.equal(runtime.audit()[0].authorized,false);
 assert.equal(runtime.audit()[0].executed,false);
});


test("already-aborted caller signal is rejected cleanly before authorization or handler execution",async()=>{
 const controller=new AbortController(); controller.abort();
 let authorizationCalls=0,handlerCalls=0;
 const runtime=createAgentRuntime({registry:registry(agent()),authorize:async()=>{authorizationCalls++;return true;},handlers:{inspect_diff:async()=>{handlerCalls++;return {ok:true};}}});
 await assert.rejects(runtime.run({agentId:"repo-verifier",role:"critique",task:{objective:"pre-aborted",tool:"inspect_diff"},signal:controller.signal}),/AGENT_INVOCATION_ABORTED/);
 assert.equal(authorizationCalls,0);
 assert.equal(handlerCalls,0);
 assert.equal(runtime.audit()[0].status,"REJECTED");
 assert.equal(runtime.audit()[0].executed,false);
});
