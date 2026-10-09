import type { Task, CapabilityKind, AgentResponse } from "./types.js";
import { CapabilityRegistry } from "./registry.js";
import { CapabilityRouter } from "./router.js";
import { EvidenceLedger } from "./ledger.js";
import { verifyResponse } from "./verification.js";
import { buildFusionPlan, type CapabilityRequirement, type OrganCandidate, type FusionPlan } from "./capability-fusion.js";

export interface SynthesisRunResult {
  plan: FusionPlan;
  organResponses: AgentResponse[];
  synthesis: AgentResponse;
  verification: "VALIDATED" | "REJECTED" | "UNPROVEN";
}

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
    const status = verified.evidence?.at(-1)?.status ?? "UNPROVEN";
    this.ledger.record({
      objective: task.objective,
      constraints: task.constraints ?? [],
      capabilitiesAvailable: this.registry.list().map(c => c.id),
      capabilitiesInvoked: [route.capability.id],
      capabilitiesExecuted: [response.capabilityId],
      verification: status,
      errors: [],
      confidence: verified.confidence,
      decision: status === "VALIDATED" ? "VALIDATED" : "UNPROVEN until task-specific verification",
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
    const unresolvedRequired = plan.unresolved.filter(requirement => requirement.required !== false);
    if (unresolvedRequired.length) {
      throw new Error("Unresolved required capabilities: " + unresolvedRequired.map(r => r.capability).join(", "));
    }
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

  /**
   * Execute evidence-selected organs, then hand their verified outputs to a distinct
   * synthesis provider. The final synthesis is independently verified before being
   * reported as VALIDATED.
   */
  async synthesizeFusion(
    task: Task,
    requirements: CapabilityRequirement[],
    candidates: OrganCandidate[],
    verifyOrgan: (output: unknown) => boolean,
    synthesizerProviderId: string,
    verifySynthesis: (output: unknown) => boolean,
  ): Promise<SynthesisRunResult> {
    const plan = buildFusionPlan(requirements, candidates);
    const unresolvedRequired = plan.unresolved.filter(requirement => requirement.required !== false);
    if (unresolvedRequired.length) {
      throw new Error("Unresolved required capabilities: " + unresolvedRequired.map(r => r.capability).join(", "));
    }

    const selectedProviderIds = new Set(plan.selections.map(selection => selection.providerId));
    if (selectedProviderIds.has(synthesizerProviderId)) {
      throw new Error("The synthesis provider must be distinct from all selected organ providers.");
    }

    const synthesizer = this.registry.getProvider(synthesizerProviderId);
    if (!synthesizer) throw new Error("Synthesis provider is not registered: " + synthesizerProviderId);
    const synthesisCapability =
      synthesizer.capabilities.find(capability => capability.kind === "reasoning") ??
      synthesizer.capabilities.find(capability => capability.kind === "critique") ??
      synthesizer.capabilities[0];
    if (!synthesisCapability) throw new Error("Synthesis provider has no declared capability.");

    const organResponses = await this.runFusion(task, requirements, candidates, verifyOrgan);
    const synthesisResponse = await synthesizer.execute({
      task,
      role: synthesisCapability.kind,
      context: {
        operation: "synthesis",
        instructions: [
          "Integrate the verified organ outputs into one coherent result.",
          "Resolve conflicts explicitly and preserve source attribution.",
          "Do not introduce claims unsupported by the supplied outputs or evidence.",
          "Return the result as one deliverable, not a list of competing proposals.",
        ],
        fusionPlan: plan,
        organOutputs: organResponses.map(response => ({
          capabilityId: response.capabilityId,
          output: response.output,
          evidence: response.evidence ?? [],
        })),
      },
    });
    const synthesis = verifyResponse(synthesisResponse, verifySynthesis);
    const status = synthesis.evidence?.at(-1)?.status ?? "UNPROVEN";
    const decision = status === "VALIDATED" ? "VALIDATED" : status === "REJECTED" ? "REJECTED" : "UNPROVEN";

    this.ledger.record({
      objective: task.objective,
      constraints: task.constraints ?? [],
      capabilitiesAvailable: this.registry.list().map(capability => capability.id),
      capabilitiesInvoked: ["synthesis:" + synthesisCapability.kind],
      capabilitiesExecuted: [synthesisResponse.capabilityId],
      verification: status,
      errors: status === "VALIDATED" ? [] : ["Synthesized deliverable did not pass task-specific verification"],
      confidence: synthesis.confidence,
      decision,
      lesson: "Composition requires a distinct synthesis step and independent final verification.",
    });

    return { plan, organResponses, synthesis, verification: status };
  }
}
