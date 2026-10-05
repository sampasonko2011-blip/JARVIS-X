import type { Task, CapabilityKind, AgentResponse } from "./types.js";
import { CapabilityRegistry } from "./registry.js";
import { CapabilityRouter } from "./router.js";
import { EvidenceLedger } from "./ledger.js";
import { verifyResponse } from "./verification.js";

export class Orchestrator {
  readonly router: CapabilityRouter;
  constructor(readonly registry: CapabilityRegistry, readonly ledger = new EvidenceLedger()) { this.router = new CapabilityRouter(registry); }

  async run(task: Task, kind: CapabilityKind = "reasoning"): Promise<AgentResponse> {
    const routes = this.router.route(task, kind);
    if (!routes.length) throw new Error(`No capability available for kind: ${kind}`);
    const route = routes[0];
    const response = await route.provider.execute({task, role: route.capability.id.split(":").slice(1).join(":") || kind, context:{routes}});
    const verified = verifyResponse(response, output => output !== undefined && output !== null);
    this.ledger.record({objective:task.objective,constraints:task.constraints ?? [],capabilitiesAvailable:this.registry.list().map(c=>c.id),capabilitiesInvoked:[route.capability.id],capabilitiesExecuted:[response.capabilityId],verification:verified.evidence?.at(-1)?.status ?? "UNPROVEN",errors:[],confidence:verified.confidence,decision:"UNPROVEN until task-specific verification"});
    return verified;
  }
}
