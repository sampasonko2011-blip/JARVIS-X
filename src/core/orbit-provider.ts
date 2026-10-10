import type { AgentResponse, Capability, Provider, Task } from "./types.js";

/**
 * Orbit-backed provider adapter.
 *
 * GitHub remains the source-of-truth/deployment backbone. Orbit is deliberately
 * injected through configuration so JARVIS-X never hard-codes a vendor or
 * assumes which model currently owns a capability.
 */
export class OrbitProvider implements Provider {
  public readonly capabilities: Capability[];

  constructor(
    public readonly id: string,
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      model: string;
      capabilities?: Capability[];
      timeoutMs?: number;
      maxOutputTokens?: number;
    }
  ) {
    this.capabilities =
      config.capabilities ??
      (["reasoning", "coding", "execution"] as const).map(
        (kind): Capability => ({
          id: `orbit:${id}:${kind}`,
          kind,
          strengths: [kind],
        })
      );
  }

  async execute(input: {
    task: Task;
    role: string;
    context: Record<string, unknown>;
  }): Promise<AgentResponse> {
    const endpoint = new URL(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`);
    if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
      throw new Error("Orbit base URL must use HTTPS (localhost is allowed for tests).");
    }
    const controller = new AbortController();
    const timeoutMs = this.config.timeoutMs ?? 30_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
      throw new Error("Orbit timeoutMs must be between 1 and 120000.");
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint, {
      signal: controller.signal,
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxOutputTokens ?? 512,
        messages: [
          {
            role: "system",
            content:
              "You are an organ inside JARVIS-X. Stay in your assigned role, provide inspectable reasoning artifacts, and never claim another organ's work as your own.",
          },
          {
            role: "user",
            content: JSON.stringify({
              objective: input.task.objective,
              constraints: input.task.constraints,
              role: input.role,
              context: input.context,
            }),
          },
        ],
      }),
      });
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Orbit inference timed out.");
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Orbit inference failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const output = payload.choices?.[0]?.message?.content;
    if (typeof output !== "string" || output.trim().length === 0) throw new Error("Orbit inference returned no model output.");

    // Keep execution evidence aligned with the exact capability advertised in the registry.
    const executedCapability = this.capabilities.find(
      capability => capability.kind === input.role || capability.id === input.role
    );

    return {
      capabilityId: executedCapability?.id ?? `${this.id}:${input.role}`,
      output,
      evidence: [
        {
          source: `orbit:${this.config.model}`,
          claim: "Model execution returned through the configured Orbit gateway.",
          status: "OBSERVED",
        },
      ],
    };
  }
}

export function orbitProviderFromEnv(id: string): OrbitProvider {
  const baseUrl = process.env.ORBIT_BASE_URL;
  const apiKey = process.env.ORBIT_API_KEY;
  const model = process.env.ORBIT_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Missing ORBIT_BASE_URL, ORBIT_API_KEY, or ORBIT_MODEL.");
  }
  return new OrbitProvider(id, { baseUrl, apiKey, model });
}
