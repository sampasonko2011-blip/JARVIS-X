import type { BridgePolicy } from "../bridge/types.js";

export interface BridgeDecision {
  allowed: boolean;
  reason: string;
}

export function authorizeBridgeRound(policy: BridgePolicy, round: number, prompt: string, mode: "read" | "write" = "read"): BridgeDecision {
  if (round < 1 || round > policy.maxRounds) return { allowed: false, reason: `round ${round} exceeds maxRounds=${policy.maxRounds}` };
  if (prompt.length > policy.maxPromptChars) return { allowed: false, reason: "prompt exceeds maxPromptChars" };
  if (mode === "write" && !policy.allowWrite) return { allowed: false, reason: "write mode disabled" };
  return { allowed: true, reason: "bridge policy accepted" };
}