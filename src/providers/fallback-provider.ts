import type { AgentRequest, AgentResponse, Capability, Provider } from "../core/types.js";
import type { CostClass } from "./openai-compatible.js";

export interface ProviderCandidate {
  provider: Provider;
  costClass: CostClass;
  enabled?: boolean;
}

/**
 * Sequential failover across explicitly enabled, operator-verified zero-cost
 * providers. This does not discover or verify upstream prices itself.
 */
export class FallbackProvider implements Provider {
  readonly capabilities: Capability[];
  readonly candidates: ProviderCandidate[];

  constructor(
    readonly id: string,
    candidates: ProviderCandidate[],
    private readonly options: { allowNonZeroCost?: boolean } = {},
  ) {
    this.candidates = candidates.filter(candidate =>
      candidate.enabled !== false &&
      (candidate.costClass === "verified-zero-cost" || options.allowNonZeroCost === true),
    );
    this.capabilities = this.candidates.flatMap(candidate => candidate.provider.capabilities);
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    if (!this.candidates.length) {
      throw new Error("No eligible provider candidates: zero-cost policy is fail-closed.");
    }
    const errors: string[] = [];
    for (const candidate of this.candidates) {
      try {
        return await candidate.provider.execute(request);
      } catch (error) {
        // Do not include request contents, credentials, or upstream response bodies in errors.
        errors.push(`${candidate.provider.id}: ${error instanceof Error ? error.message : "execution failed"}`);
      }
    }
    throw new Error(`All eligible providers failed (${errors.join("; ")}).`);
  }
}
