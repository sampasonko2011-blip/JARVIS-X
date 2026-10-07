export type EvidenceStatus = "OBSERVED" | "VALIDATED" | "PROPOSED" | "UNPROVEN" | "REJECTED" | "SUPERSEDED";

export interface CapabilityEvidence {
  providerId: string;
  capability: string;
  score: number;
  status: EvidenceStatus;
  sampleSize: number;
  latencyMs?: number;
  cost?: number;
  notes?: string;
}

export interface CapabilityRequirement {
  capability: string;
  weight: number;
  required?: boolean;
}

export interface OrganCandidate {
  providerId: string;
  capabilities: Set<string>;
  evidence: CapabilityEvidence[];
}

export interface FusionSelection {
  capability: string;
  providerId: string;
  score: number;
  evidenceStatus: EvidenceStatus;
  reason: string;
}

export interface FusionPlan {
  selections: FusionSelection[];
  unresolved: CapabilityRequirement[];
}

function statusMultiplier(status: EvidenceStatus): number {
  switch (status) {
    case "VALIDATED": return 1;
    case "OBSERVED": return 0.75;
    case "PROPOSED": return 0.4;
    case "UNPROVEN": return 0.25;
    case "SUPERSEDED": return 0;
    case "REJECTED": return 0;
  }
}

/**
 * Evidence-driven attribute router.
 *
 * Models are organs; capabilities are attributes. No provider owns a
 * permanent position. The best currently supported organ wins each
 * micro-capability, subject to evidence quality.
 */
export function buildFusionPlan(
  requirements: CapabilityRequirement[],
  candidates: OrganCandidate[],
): FusionPlan {
  const selections: FusionSelection[] = [];
  const unresolved: CapabilityRequirement[] = [];

  for (const requirement of requirements) {
    const options = candidates
      .filter((candidate) => candidate.capabilities.has(requirement.capability))
      .flatMap((candidate) =>
        candidate.evidence
          .filter((e) =>
            e.capability === requirement.capability &&
            e.status !== "REJECTED" &&
            e.status !== "SUPERSEDED",
          )
          .map((e) => ({
            providerId: candidate.providerId,
            evidence: e,
            effectiveScore: e.score * statusMultiplier(e.status),
          })),
      )
      .sort((a, b) => b.effectiveScore - a.effectiveScore);

    const winner = options[0];
    if (!winner) {
      unresolved.push(requirement);
      continue;
    }

    selections.push({
      capability: requirement.capability,
      providerId: winner.providerId,
      score: winner.effectiveScore,
      evidenceStatus: winner.evidence.status,
      reason: `${winner.providerId} currently leads on ${requirement.capability} with ${winner.evidence.status} evidence`,
    });
  }

  return { selections, unresolved };
}
