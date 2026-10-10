import type { AgentResponse, Capability, Provider, Task } from "../core/types.js";

export type CostClass = "verified-zero-cost" | "paid" | "trial" | "unknown";

/**
 * Provider-neutral adapter for local gateways (including FreeLLMpool) and
 * any OpenAI-compatible endpoint. Cost is deliberately an explicit operator
 * assertion: this adapter cannot independently verify an upstream provider's
 * live pricing or terms.
 */
export class OpenAICompatibleProvider implements Provider {
  readonly capabilities: Capability[];

  constructor(
    readonly id: string,
    private readonly config: {
      baseUrl: string;
      model: string;
      costClass: CostClass;
      apiKey?: string;
      capabilities?: Capability[];
      timeoutMs?: number;
      maxOutputTokens?: number;
      allowNonZeroCost?: boolean;
    },
  ) {
    this.capabilities = config.capabilities ?? (["reasoning", "coding", "research", "critique"] as const).map(
      (kind): Capability => ({ id: `${id}:${kind}`, kind, strengths: [kind] }),
    );
  }

  async execute(input: { task: Task; role: string; context: Record<string, unknown> }): Promise<AgentResponse> {
    if (this.config.costClass !== "verified-zero-cost" && this.config.allowNonZeroCost !== true) {
      throw new Error(`Provider ${this.id} blocked: cost class is ${this.config.costClass}; zero-cost policy is fail-closed.`);
    }
    if (!this.config.model.trim()) throw new Error("Provider model must be non-empty.");
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const endpoint = new URL(base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`);
    const localHttp = endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !localHttp) throw new Error("Provider base URL must use HTTPS (loopback HTTP is allowed).");
    const timeoutMs = this.config.timeoutMs ?? 30_000;
    const maxOutputTokens = this.config.maxOutputTokens ?? 1024;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error("timeoutMs must be an integer between 1 and 120000.");
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 4096) throw new Error("maxOutputTokens must be an integer between 1 and 4096.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
      response = await fetch(endpoint, {
        method: "POST", headers, signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: maxOutputTokens,
          messages: [
            { role: "system", content: `You are the ${input.role} capability in JARVIS-X. Return a useful, checkable result; do not claim external verification you did not perform.` },
            { role: "user", content: JSON.stringify({ objective: input.task.objective, constraints: input.task.constraints ?? [], inputs: input.task.inputs, context: input.context }) },
          ],
        }),
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Provider ${this.id} timed out.`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`Provider ${this.id} failed: HTTP ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const output = payload.choices?.[0]?.message?.content;
    if (typeof output !== "string" || !output.trim()) throw new Error(`Provider ${this.id} returned no text output.`);
    const capability = this.capabilities.find(c => c.kind === input.role || c.id === input.role);
    return {
      capabilityId: capability?.id ?? `${this.id}:${input.role}`,
      output,
      evidence: [{ source: `provider:${this.id}/model:${this.config.model}`, claim: "Configured OpenAI-compatible endpoint returned text; upstream quality and pricing are not independently verified.", status: "OBSERVED" }],
    };
  }
}
