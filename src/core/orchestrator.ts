import type { Task, CapabilityKind, AgentResponse } from "./types.js";
import { CapabilityRegistry } from "./registry.js";
import { CapabilityRouter } from "./router.js";
import { EvidenceLedger } from "./ledger.js";
import { verifyResponse } from "./verification.js";
import { buildFusionPlan, type CapabilityRequirement, type OrganCandidate, type FusionPlan } from "./capability-fusion.js";
import type { MemoryOS } from "./memory-os.js";

export interface SynthesisRunResult {
  plan: FusionPlan;
  organResponses: AgentResponse[];
  synthesis: AgentResponse;
  verification: "VALIDATED" | "REJECTED" | "UNPROVEN";
}

export interface OrchestratorMemoryOptions {
  memory: MemoryOS;
  project?: string;
}

export class Orchestrator {
  readonly router: CapabilityRouter;
  private readonly memoryOptions?: OrchestratorMemoryOptions;

  constructor(readonly registry: CapabilityRegistry, readonly ledger = new EvidenceLedger(), memoryOptions?: OrchestratorMemoryOptions) {
    this.router = new CapabilityRouter(registry);
    this.memoryOptions = memoryOptions;
  }

  private checkpoint(task: Task, nextAction: string, blockers: string[] = []): void {
    if (!this.memoryOptions) return;
    this.memoryOptions.memory.saveCheckpoint({
      project: this.memoryOptions.project ?? "JARVIS-X",
      task: task.objective,
      nextAction,
      blockers,
      contextRefs: ["task:" + task.id],
    });
  }

  async run(
    task: Task,
    kind: CapabilityKind = "reasoning",
    verification?: (output: unknown) => boolean,
  ): Promise<AgentResponse> {
    this.checkpoint(task, "Execute selected capability: " + kind);
    try {
      const routes = this.router.route(task, kind);
      if (!routes.length) throw new Error("No capability available for kind: " + kind);
      const route = routes[0];
      const response = await route.provider.execute({
        task,
        role: route.capability.kind,
        context: { routes },
      });
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
      this.checkpoint(task, "Review evidence ledger and decide whether to accept, adapt, or retest", status === "VALIDATED" ? [] : ["Output is not independently validated: " + status]);
      return verified;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.checkpoint(task, "Diagnose failure and retry or re-plan", [message]);
      throw error;
    }
  }

  async runFusion(
    task: Task,
    requirements: CapabilityRequirement[],
    candidates: OrganCandidate[],
    verification: (output: unknown) => boolean = () => false,
  ): Promise<AgentResponse[]> {
    this.checkpoint(task, "Build fusion plan and execute selected capabilities");
    try {
      const plan = buildFusionPlan(requirements, candidates);
      const unresolvedRequired = plan.unresolved.filter(requirement => requirement.required !== false);
      if (unresolvedRequired.length) throw new Error("Unresolved capabilities: " + unresolvedRequired.map(r => r.capability).join(", "));
      const responses: AgentResponse[] = [];

      for (const selection of plan.selections) {
        this.checkpoint(task, "Execute and verify fusion capability: " + selection.capability);
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
      this.checkpoint(task, "Review all verified fusion outputs and run independent synthesis", []);
      return responses;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.checkpoint(task, "Diagnose fusion failure, update plan, and retry", [message]);
      throw error;
    }
  }

  async synthesizeFusion(
    task: Task,
    requirements: CapabilityRequirement[],
    candidates: OrganCandidate[],
    verifyOrgan: (output: unknown) => boolean,
    synthesizerProviderId: string,
    verifySynthesis: (output: unknown) => boolean,
  ): Promise<SynthesisRunResult> {
    this.checkpoint(task, "Validate fusion plan, run organs, synthesize and independently verify");
    try {
      const plan = buildFusionPlan(requirements, candidates);
      const unresolvedRequired = plan.unresolved.filter(requirement => requirement.required !== false);
      if (unresolvedRequired.length) throw new Error("Unresolved capabilities: " + unresolvedRequired.map(r => r.capability).join(", "));
      const selectedProviderIds = new Set(plan.selections.map(selection => selection.providerId));
      if (selectedProviderIds.has(synthesizerProviderId)) throw new Error("The synthesis provider must be distinct from all selected organ providers.");
      const synthesizer = this.registry.getProvider(synthesizerProviderId);
      if (!synthesizer) throw new Error("Synthesis provider is not registered: " + synthesizerProviderId);
      const synthesisCapability =
        synthesizer.capabilities.find(capability => capability.kind === "reasoning") ??
        synthesizer.capabilities.find(capability => capability.kind === "critique") ??
        synthesizer.capabilities[0];
      if (!synthesisCapability) throw new Error("Synthesis provider has no declared capability.");
      const organResponses = await this.runFusion(task, requirements, candidates, verifyOrgan);
      this.checkpoint(task, "Synthesize verified outputs with a distinct provider");
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
      const rawStatus = synthesis.evidence?.at(-1)?.status ?? "UNPROVEN";
      const status: SynthesisRunResult["verification"] =
        rawStatus === "VALIDATED" ? "VALIDATED" :
        rawStatus === "REJECTED" ? "REJECTED" : "UNPROVEN";
      const decision = status;
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
      this.checkpoint(task, "Review synthesis evidence and capture lesson or comparable retest", status === "VALIDATED" ? [] : ["Synthesis status: " + status]);
      return { plan, organResponses, synthesis, verification: status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.checkpoint(task, "Diagnose synthesis failure, update plan, and retry", [message]);
      throw error;
    }
  }
}
