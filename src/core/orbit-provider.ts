import type { AgentResponse, Provider, Task } from "./types.js";

/**
 * Orbit-backed provider adapter.
 *
 * GitHub remains the source-of-truth/deployment backbone.
 * Orbit supplies the concrete model selected by JARVIS-X.
 *
 * Orbit's current OpenAI-compatible base URL is:
 *   https://api.tryorbit.cloud/api/v1
 *
 * Runtime configuration:
 *   ORBIT_BASE_URL - defaults to Orbit's current API base URL
 *   ORBIT_API_KEY  - Orbit API key
 *   ORBIT_MODEL    - concrete model selected by the dominance router
 */
export class OrbitProvider implements Provider {
  constructor(
    public readonly id: string,
    private readonly config: {
      baseUrl: string;
      apiKey: string;
      model: string;
    }
  ) {}

  async execute(input: {
    task: Task;
    role: string;
    context: Record<string, unknown>;
  }): Promise<AgentResponse> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content:
              "You are an organ inside JARVIS-X. Stay in your assigned role, provide inspectable artifacts, and never claim another organ's work as your own."
          },
          {
            role: "user",
            content: JSON.stringify({
              objective: input.task.objective,
              constraints: input.task.constraints,
              role: input.role,
              context: input.context
            })
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Orbit inference failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const output = payload.choices?.[0]?.message?.content;
    if (!output) throw new Error("Orbit inference returned no model output.");

    return {
      capabilityId: `${this.id}:${input.role}`,
      output,
      evidence: [
        {
          source: `orbit:${this.config.model}`,
          claim: "Model execution returned through the configured Orbit gateway.",
          status: "OBSERVED"
        }
      ]
    };
  }
}

export function orbitProviderFromEnv(id: string): OrbitProvider {
  const baseUrl =
    process.env.ORBIT_BASE_URL ?? "https://api.tryorbit.cloud/api/v1";
  const apiKey = process.env.ORBIT_API_KEY;
  const model = process.env.ORBIT_MODEL;

  if (!apiKey || !model) {
    throw new Error("Missing ORBIT_API_KEY or ORBIT_MODEL.");
  }

  return new OrbitProvider(id, { baseUrl, apiKey, model });
}
