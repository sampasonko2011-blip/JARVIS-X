export type EvidenceStatus = "OBSERVED" | "VALIDATED" | "PROPOSED" | "UNPROVEN" | "REJECTED" | "SUPERSEDED";

export interface CapabilityEvidence { providerId: string; capability: string; score: number; status: EvidenceStatus; sampleSize: number; latencyMs?: number; cost?: number; notes?: string; }
export interface CapabilityRequirement { capability: string; weight: number; required?: boolean; }
export interface OrganCandidate { providerId: string; capabilities: Set<string>; evidence: CapabilityEvidence[]; }
export interface FusionSelection { capability: string; providerId: string; score: number; evidenceStatus: EvidenceStatus; reason: string; }
export interface FusionPlan { selections: FusionSelection[]; unresolved: CapabilityRequirement[]; }

function statusRank(status: EvidenceStatus): number {
  switch (status) {
    case "VALIDATED": return 3;
    case "OBSERVED": return 2;
    case "PROPOSED": return 1;
    case "UNPROVEN": return 0;
    case "SUPERSEDED":
    case "REJECTED": return -1;
  }
}

/**
 * Evidence quality is a hard ordering dimension: validated evidence outranks weaker
 * evidence even when the weaker candidate has a higher raw score. Evidence must also
 * belong to the candidate that is claiming it; mismatched provider provenance is ignored.
 */
export function buildFusionPlan(requirements: CapabilityRequirement[], candidates: OrganCandidate[]): FusionPlan {
  const selections: FusionSelection[] = [];
  const unresolved: CapabilityRequirement[] = [];

  for (const requirement of requirements) {
    const options = candidates
      .filter(candidate => candidate.capabilities.has(requirement.capability))
      .flatMap(candidate => candidate.evidence
        .filter(e =>
          e.providerId === candidate.providerId &&
          e.capability === requirement.capability &&
          e.status !== "REJECTED" &&
          e.status !== "SUPERSEDED"
        )
        .map(e => ({ providerId: candidate.providerId, evidence: e })))
      .sort((a, b) => {
        const statusDelta = statusRank(b.evidence.status) - statusRank(a.evidence.status);
        return statusDelta !== 0 ? statusDelta : b.evidence.score - a.evidence.score;
      });

    const winner = options[0];
    if (!winner) { unresolved.push(requirement); continue; }

    selections.push({
      capability: requirement.capability,
      providerId: winner.providerId,
      score: winner.evidence.score,
      evidenceStatus: winner.evidence.status,
      reason: winner.providerId + " currently leads on " + requirement.capability + " with " + winner.evidence.status + " evidence",
    });
  }
  return { selections, unresolved };
}
