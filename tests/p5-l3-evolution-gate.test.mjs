import test from "node:test";
import assert from "node:assert/strict";
import { createEvolutionProposal, approveEvolutionProposal, activateApprovedProposal } from "../hq/l3-evolution-gate.mjs";

const passing = () => createEvolutionProposal({
  id:"candidate-1",title:"Safer study prompt",artifact:"prompt-v2",baselineId:"baseline-v1",
  testReport:{suiteId:"regression-2026-11",cases:[{id:"normal",status:"PASS"},{id:"injection",status:"PASS"}],evidenceRefs:["run://unit-1"]}
});
test("proposal remains inert until explicitly approved", async () => {
  const proposal = passing();
  assert.equal(proposal.state,"PROPOSED");
  let activated = false;
  await assert.rejects(()=>activateApprovedProposal(proposal,{activate:async()=>{activated=true},confirmId:proposal.id}),/HUMAN_APPROVAL_REQUIRED/);
  assert.equal(activated,false);
});
test("failed or empty regression suite cannot be approved", () => {
  const proposal = createEvolutionProposal({id:"bad",title:"bad",artifact:"x",baselineId:"base",testReport:{suiteId:"suite",cases:[{status:"FAIL"}]}});
  assert.throws(()=>approveEvolutionProposal(proposal,{approvedBy:"human",approvalNote:"reviewed",expectedSuiteId:"suite"}),/REGRESSION_GATE_FAILED/);
});
test("approval requires exact suite and explicit activation confirmation", async () => {
  const proposal = passing();
  assert.throws(()=>approveEvolutionProposal(proposal,{approvedBy:"human",approvalNote:"reviewed",expectedSuiteId:"other"}),/EVIDENCE_SUITE_MISMATCH/);
  const approved = approveEvolutionProposal(proposal,{approvedBy:"human",approvalNote:"reviewed",expectedSuiteId:"regression-2026-11"});
  assert.equal(approved.state,"APPROVED_FOR_ACTIVATION");
  await assert.rejects(()=>activateApprovedProposal(approved,{activate:async()=>true,confirmId:"wrong"}),/EXPLICIT_ACTIVATION_CONFIRMATION_REQUIRED/);
  const result = await activateApprovedProposal(approved,{activate:async({id})=>({activated:id}),confirmId:"candidate-1"});
  assert.deepEqual(result,{activated:"candidate-1"});
});
