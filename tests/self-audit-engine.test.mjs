import assert from "node:assert/strict";
import test from "node:test";
import { runSelfAudit } from "../dist/core/self-audit.js";

const good={
 objective:"Improve runtime correctness",
 changeClass:"internal-code",
 explicitApproval:true,
 comparableRetest:true,
 metrics:[
  {name:"correctness",baseline:0.8,candidate:0.9,direction:"higher"},
  {name:"safety",baseline:1,candidate:1,direction:"higher"},
  {name:"latency",baseline:200,candidate:180,direction:"lower"},
  {name:"cost",baseline:0,candidate:0,direction:"lower"}
 ],
 checks:["build","unit-tests","regression","security","privacy","cost-guard"].map(name=>({name,result:"pass"})),
 evidence:[{claim:"CI benchmark",status:"VALIDATED",source:"ci://run/123",sourceHash:"sha256:abc",revision:"candidate-2"}],
 independentChallenge:"pass",
 regressionTests:"pass",
 restartPersistence:"not-applicable",
 evaluation:{
  scope:"runtime-contract",executionMode:"deterministic",
  baselineRunId:"base-run",candidateRunId:"candidate-run",
  baselineRevision:"base-1",candidateRevision:"candidate-2",
  taskSetHash:"sha256:tasks",holdoutSetHash:"sha256:holdout",
  environmentHash:"sha256:env",protocolHash:"sha256:protocol",
  rubricVersion:"runtime-v1",paired:true,holdoutSampleCount:12,
  leakageCheck:"pass",independentGrader:"not-required",
  primaryMetric:"correctness",primaryImprovementLowerBound:0.05
 },
 cost:{known:true,currency:"USD",actual:0,ceiling:0},
 liveProviderCalls:0
};
test("promotes only a sourced comparable improvement with all gates passing",()=>{const r=runSelfAudit(good);assert.equal(r.decision,"KEEP");assert.equal(r.status,"VALIDATED");assert.equal(r.improvementPercent.correctness,12.5);assert.equal(r.improvementPercent.latency,10);});
test("unknown evidence remains unproven, not zero or success",()=>{const r=runSelfAudit({...good,evidence:[],independentChallenge:"unknown"});assert.equal(r.decision,"UNPROVEN");assert.match(r.reasons.join(" "),/No source-backed/);});
test("regression rejects candidate",()=>{const r=runSelfAudit({...good,metrics:[{name:"correctness",baseline:0.9,candidate:0.7,direction:"higher"},{name:"safety",baseline:1,candidate:1,direction:"higher"},{name:"latency",baseline:200,candidate:180,direction:"lower"},{name:"cost",baseline:0,candidate:0,direction:"lower"}]});assert.equal(r.decision,"REJECT");assert.equal(r.status,"REJECTED");});
test("deployment requires explicit approval",()=>{const r=runSelfAudit({...good,changeClass:"deployment",explicitApproval:false});assert.equal(r.decision,"UNPROVEN");assert.match(r.reasons.join(" "),/Explicit approval/);});
test("repeated failure trips circuit breaker and stops retries",()=>{const r=runSelfAudit({...good,recentFailureSignatures:["auth_timeout","auth_timeout"]});assert.equal(r.circuitBreaker,true);assert.equal(r.decision,"UNPROVEN");assert.match(r.nextAction,/STOP retries/);});
test("memory objective requires persistence after restart",()=>{const r=runSelfAudit({...good,objective:"Improve memory persistence",restartPersistence:"unknown"});assert.equal(r.decision,"UNPROVEN");assert.match(r.reasons.join(" "),/Persistence after restart|restart/);});
test("malformed top-level inputs fail closed instead of throwing",()=>{for(const value of [null,undefined,[],"bad",{...good,metrics:null},{...good,evaluation:{...good.evaluation,scope:"maybe"}},{...good,restartPersistence:"later"}]){const r=runSelfAudit(value);assert.equal(r.decision,"UNPROVEN");assert.equal(r.status,"UNPROVEN");}});
test("non-finite values, duplicate metrics, and malformed evidence cannot promote",()=>{const r=runSelfAudit({...good,metrics:[{name:"correctness",baseline:1,candidate:Number.NaN,direction:"higher"},{name:"correctness",baseline:1,candidate:2,direction:"higher"}]});assert.equal(r.decision,"UNPROVEN");assert.match(r.reasons.join(" "),/finite numbers/);});
test("a zero baseline reports null percent rather than fabricated improvement",()=>{const r=runSelfAudit({...good,metrics:[{name:"correctness",baseline:0,candidate:0.1,direction:"higher"},{...good.metrics[1]},{...good.metrics[2]},{...good.metrics[3]}]});assert.equal(r.improvementPercent.correctness,null);assert.equal(r.metricDeltas.correctness,0.1);});
test("duplicate failure signatures trip the circuit breaker",()=>{const r=runSelfAudit({...good,recentFailureSignatures:["same","same"]});assert.equal(r.circuitBreaker,true);assert.equal(r.decision,"UNPROVEN");});
test("unknown evidence status is malformed and cannot be promoted",()=>{const r=runSelfAudit({...good,evidence:[{claim:"x",status:"MAGIC",source:"ci://x"}]});assert.equal(r.decision,"UNPROVEN");});
test("unknown required checks block promotion",()=>{const r=runSelfAudit({...good,checks:good.checks.map(c=>c.name==="security"?{...c,result:"unknown"}:c)});assert.equal(r.decision,"UNPROVEN");});
