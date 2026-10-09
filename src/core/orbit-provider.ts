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
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
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

    if (!response.ok) {
      throw new Error(`Orbit inference failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const output = payload.choices?.[0]?.message?.content;
    if (!output) throw new Error("Orbit inference returned no model output.");

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
