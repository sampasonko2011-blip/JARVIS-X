/**
 * Proposal gate only. It never edits prompts/rules or activates a candidate.
 * A caller must obtain explicit human approval and separately invoke activation.
 */
export function createEvolutionProposal({ id, title, artifact, baselineId, testReport }) {
  if (!id || !title || typeof artifact !== "string" || !artifact.trim()) throw new TypeError("INVALID_EVOLUTION_PROPOSAL");
  if (!baselineId || !testReport || !Array.isArray(testReport.cases)) throw new TypeError("BASELINE_AND_TEST_EVIDENCE_REQUIRED");
  const passed = testReport.cases.filter((item) => item.status === "PASS").length;
  const failed = testReport.cases.filter((item) => item.status !== "PASS").length;
  return Object.freeze({
    id, title, artifact, baselineId,
    evidence: Object.freeze({
      suiteId: String(testReport.suiteId ?? "UNSPECIFIED"),
      cases: testReport.cases.length, passed, failed,
      status: failed === 0 && testReport.cases.length > 0 ? "PASS" : "FAIL",
      evidenceRefs: Object.freeze((testReport.evidenceRefs ?? []).filter((x) => typeof x === "string").slice(0, 100)),
    }),
    state: "PROPOSED",
    approval: null,
  });
}
export function approveEvolutionProposal(proposal, { approvedBy, approvalNote, expectedSuiteId }) {
  if (!proposal || proposal.state !== "PROPOSED") throw new Error("PROPOSAL_NOT_PENDING");
  if (!approvedBy || !approvalNote) throw new Error("HUMAN_APPROVAL_REQUIRED");
  if (proposal.evidence.status !== "PASS" || proposal.evidence.cases < 1) throw new Error("REGRESSION_GATE_FAILED");
  if (expectedSuiteId !== proposal.evidence.suiteId) throw new Error("EVIDENCE_SUITE_MISMATCH");
  return Object.freeze({
    ...proposal, state: "APPROVED_FOR_ACTIVATION",
    approval: Object.freeze({ approvedBy: String(approvedBy), approvalNote: String(approvalNote), approvedAt: new Date().toISOString(), suiteId: expectedSuiteId }),
  });
}
export async function activateApprovedProposal(proposal, { activate, confirmId } = {}) {
  if (!proposal || proposal.state !== "APPROVED_FOR_ACTIVATION" || !proposal.approval) throw new Error("HUMAN_APPROVAL_REQUIRED");
  if (confirmId !== proposal.id) throw new Error("EXPLICIT_ACTIVATION_CONFIRMATION_REQUIRED");
  if (typeof activate !== "function") throw new Error("ACTIVATION_ADAPTER_REQUIRED");
  return activate({ id: proposal.id, artifact: proposal.artifact, approval: proposal.approval });
}
