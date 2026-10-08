import type { AgentRequest, AgentResponse, Provider } from "../core/types.js";
import { FrenemySessionProvider } from "../bridge/frenemy.js";
import type { BridgePolicy } from "../bridge/types.js";

export class ClaudeNativeProvider implements Provider {
  readonly id = "claude-native";
  readonly capabilities = [{
    id: "claude-native:critique",
    kind: "critique" as const,
    strengths: [
      "adversarial critique",
      "red-team reasoning",
      "independent second opinion",
      "assumption detection"
    ],
    limits: [
      "requires authenticated Claude CLI session",
      "runtime availability is environment-dependent"
    ],
    metadata: { status: "PROVIDER_ADAPTER_READY", execution: "UNVERIFIED" }
  }];

  constructor(private readonly session = new FrenemySessionProvider()) {}

  async execute(request: AgentRequest): Promise<AgentResponse> {
    const result = await this.session.execute({
      prompt: [
        "JARVIS-X role: Claude critic / red-team organ.",
        "Do not blindly agree. Identify assumptions, failure modes, contradictions, and stronger alternatives.",
        "",
        request.task.objective,
        request.task.constraints?.length ? `Constraints:\n- ${request.task.constraints.join("\n- ")}` : "",
        request.context ? `Context:\n${JSON.stringify(request.context)}` : ""
      ].filter(Boolean).join("\n\n"),
      mode: "read"
    });

    return {
      capabilityId: "claude-native:critique",
      output: result.ok ? result.text : { error: result.error, provider: result.provider },
      confidence: result.ok ? 0.5 : 0,
      evidence: [{
        source: "claude-native-session",
        claim: result.ok ? "Claude native session executed" : "Claude native session did not execute",
        status: result.ok ? "OBSERVED" : "UNPROVEN",
        details: result.error ?? `elapsedMs=${Math.round(result.elapsedMs)}`
      }]
    };
  }
}

export function registerClaudeNative(
  registry: { register(provider: Provider): void },
  policy?: BridgePolicy
): ClaudeNativeProvider {
  const provider = new ClaudeNativeProvider(new FrenemySessionProvider(policy));
  registry.register(provider);
  return provider;
}
