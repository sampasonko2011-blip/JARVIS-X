import type { AgentResponse, ClaimStatus, Evidence } from "./types.js";

export function classifyEvidence(response: AgentResponse, verification: (output: unknown) => boolean): Evidence[] {
  const status: ClaimStatus = verification(response.output) ? "VALIDATED" : "UNPROVEN";
  return [{source: response.capabilityId, claim: "agent output", status}];
}

export function verifyResponse(response: AgentResponse, verification: (output: unknown) => boolean): AgentResponse {
  return {...response, evidence: [...(response.evidence ?? []), ...classifyEvidence(response, verification)]};
}
