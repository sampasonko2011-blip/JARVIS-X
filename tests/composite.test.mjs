import test from "node:test"; import assert from "node:assert/strict"; import { CompositeEngine } from "../dist/core/composite.js";
function p(id,calls,out){return {id,capabilities:[{id:id+":x",kind:"reasoning",strengths:["reasoning"]}],async execute(){calls.push(id);return {capabilityId:id+":x",output:out,evidence:[{source:id,claim:"executed",status:"OBSERVED"}]}}}}
test("roster is utility-first and 5-7",()=>{const e=new CompositeEngine([]);const r=e.selectRoster(["a","b","c","d","e","f","g","h"].map((id,i)=>({providerId:id,capabilities:[["reasoning","coding","vision","research","critique","fast","reasoning","noise"][i]],utilityScore:10-i,status:i===7?"REJECTED":"VALIDATED"})));assert.equal(r.length,6);assert.deepEqual(r.map(x=>x.providerId),["a","b","c","d","e","f"])});
test("parallel composite verifies survivors",async()=>{const calls=[];const ps=["a","b","c","d","e"].map((id,i)=>p(id,calls,i===2?"bad":"ok"));const e=new CompositeEngine(ps);const r=await e.run({id:"t1",objective:"solve",constraints:[]},ps.map((x,i)=>({providerId:x.id,capabilities:[i===4?"critique":"reasoning"],utilityScore:10-i,status:"VALIDATED"})),x=>x.output!=="bad");assert.equal(r.verification,"VALIDATED");assert.equal(r.selected.length,4);assert.equal(r.rejected.length,1);assert.equal(calls.length,5)});
test("critic requirement fails closed",async()=>{const calls=[];const ps=["a","b","c","d","e"].map(id=>p(id,calls,"ok"));const e=new CompositeEngine(ps);const r=await e.run({id:"t2",objective:"solve",constraints:[]},ps.map((x,i)=>({providerId:x.id,capabilities:["reasoning"],utilityScore:10-i,status:"VALIDATED"})),()=>true);assert.equal(r.verification,"UNPROVEN")});
test("parallel execution isolates a provider exception and retains the verified independent critic", async () => {
  const calls = [];
  const ps = ["a", "b", "c", "d", "critic"].map((id) => p(id, calls, "ok"));
  ps[1].execute = async () => { calls.push("b"); throw new Error("fixture outage"); };
  const roster = ps.map((x, i) => ({
    providerId: x.id,
    capabilities: [i === 4 ? "critique" : "reasoning"],
    utilityScore: 10 - i,
    status: "VALIDATED",
  }));
  const result = await new CompositeEngine(ps).run(
    { id: "provider-outage", objective: "recover from an organ outage", constraints: [] },
    roster,
    response => response.output === "ok",
  );

  assert.equal(result.verification, "VALIDATED");
  assert.equal(result.selected.length, 4);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rationale.join(" "), /Isolated failure: b: fixture outage/);
  assert.equal(calls.length, 5);
});

test("sequential execution isolates verifier exceptions without validating the failed organ", async () => {
  const calls = [];
  const ps = ["a", "b", "c", "d", "critic"].map((id) => p(id, calls, "ok"));
  const roster = ps.map((x, i) => ({
    providerId: x.id,
    capabilities: [i === 4 ? "critique" : "reasoning"],
    utilityScore: 10 - i,
    status: "VALIDATED",
  }));
  const result = await new CompositeEngine(ps, {
    minMembers: 5,
    maxMembers: 7,
    requireIndependentCritic: true,
    parallelize: false,
  }).run(
    { id: "verifier-exception", objective: "isolate verifier faults", constraints: [] },
    roster,
    response => {
      if (response.capabilityId === "b:x") throw new Error("verifier fixture fault");
      return response.output === "ok";
    },
  );

  assert.equal(result.verification, "VALIDATED");
  assert.equal(result.selected.length, 4);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rationale.join(" "), /Verifier failed for b: verifier fixture fault/);
  assert.deepEqual(calls, ["a", "b", "c", "d", "critic"]);
});
