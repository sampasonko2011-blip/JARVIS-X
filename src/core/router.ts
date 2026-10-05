import type { Capability, Task, Provider } from "./types.js";
import { CapabilityRegistry } from "./registry.js";

export interface Route { provider: Provider; capability: Capability; score: number; reasons: string[]; }

export class CapabilityRouter {
  constructor(private readonly registry: CapabilityRegistry) {}
  route(task: Task, preferredKind: Capability["kind"]): Route[] {
    return this.registry.find(preferredKind)
      .map(capability => {
        const provider = [...new Set([capability.id.split(":")[0]])]
          .map(id => this.registry.getProvider(id)).find(Boolean);
        if (!provider) return undefined;
        const score = capability.strengths.some(s => task.objective.toLowerCase().includes(s.toLowerCase())) ? 2 : 1;
        return { provider, capability, score, reasons: ["kind match", score === 2 ? "objective-strength match" : "generic capability match"] };
      })
      .filter((x): x is Route => Boolean(x))
      .sort((a,b) => b.score-a.score);
  }
}
