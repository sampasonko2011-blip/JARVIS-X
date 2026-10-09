import type { Task, CapabilityKind, AgentResponse } from "./types.js";
import { CapabilityRegistry } from "./registry.js";
import { CapabilityRouter } from "./router.js";
import { EvidenceLedger } from "./ledger.js";
import { verifyResponse } from "./verification.js";
import { buildFusionPlan, type CapabilityRequirement, type OrganCandidate } from "./capability-fusion.js";

export class Orchestrator {
  readonly router: CapabilityRouter;
  constructor(readonly registry: CapabilityRegistry, readonly ledger = new EvidenceLedger()) {
    this.router = new CapabilityRouter(registry);
  }

  async run(
    task: Task,
    kind: CapabilityKind = "reasoning",
    verification?: (output: unknown) => boolean,
  ): Promise<AgentResponse> {
    const routes = this.router.route(task, kind);
    if (!routes.length) throw new Error("No capability available for kind: " + kind);
    const route = routes[0];
    const response = await route.provider.execute({
      task,
      // Capability IDs are opaque. The declared capability kind is the stable role contract.
      role: route.capability.kind,
      context: { routes },
    });
    // An output existing is not proof that it satisfies the task. Without a task-specific
    // verifier, preserve uncertainty rather than upgrading generated output to VALIDATED.
    const verified = verifyResponse(response, output =>
      typeof verification === "function" ? verification(output) : false,
    );
    this.ledger.record({
      objective: task.objective,
      constraints: task.constraints ?? [],
      capabilitiesAvailable: this.registry.list().map(c => c.id),
      capabilitiesInvoked: [route.capability.id],
      capabilitiesExecuted: [response.capabilityId],
      verification: verified.evidence?.at(-1)?.status ?? "UNPROVEN",
      errors: [],
      confidence: verified.confidence,
      decision: "UNPROVEN until task-specific verification",
    });
    return verified;
  }

  async runFusion(
    task: Task,
    requirements: CapabilityRequirement[],
    candidates: OrganCandidate[],
    verification: (output: unknown) => boolean = () => false,
  ): Promise<AgentResponse[]> {
    const plan = buildFusionPlan(requirements, candidates);
    if (plan.unresolved.length) throw new Error("Unresolved capabilities: " + plan.unresolved.map(r => r.capability).join(", "));
    const responses: AgentResponse[] = [];

    for (const selection of plan.selections) {
      const provider = this.registry.getProvider(selection.providerId);
      if (!provider) throw new Error("Selected provider is not registered: " + selection.providerId);

      const response = await provider.execute({
        task,
        role: selection.capability,
        context: { fusionPlan: plan, selectedProvider: selection.providerId, selectionReason: selection.reason },
      });
      const verified = verifyResponse(response, verification);
      const finalEvidence = verified.evidence?.at(-1);

      if (finalEvidence?.status !== "VALIDATED") {
        this.ledger.record({
          objective: task.objective,
          constraints: task.constraints ?? [],
          capabilitiesAvailable: this.registry.list().map(c => c.id),
          capabilitiesInvoked: [selection.capability],
          capabilitiesExecuted: [response.capabilityId],
          verification: finalEvidence?.status ?? "UNPROVEN",
          errors: ["Fusion response failed verification"],
          confidence: verified.confidence,
          decision: "REJECTED",
        });
        throw new Error("Fusion response failed verification for capability: " + selection.capability);
      }

      this.ledger.record({
        objective: task.objective,
        constraints: task.constraints ?? [],
        capabilitiesAvailable: this.registry.list().map(c => c.id),
        capabilitiesInvoked: [selection.capability],
        capabilitiesExecuted: [response.capabilityId],
        verification: finalEvidence.status,
        errors: [],
        confidence: verified.confidence,
        decision: "VALIDATED",
      });
      responses.push(verified);
    }
    return responses;
  }
}
