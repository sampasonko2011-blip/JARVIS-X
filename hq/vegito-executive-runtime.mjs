import { randomUUID } from "node:crypto";
import { createGovernedAgentHost } from "./governed-agent-host.mjs";

const MAX_OBJECTIVE_CHARS = 8000;
const MAX_STAGES = 8;
const MAX_ARTIFACT_CHARS = 32000;

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function validPlan(stages) {
  if (!Array.isArray(stages) || stages.length < 1 || stages.length > MAX_STAGES) return false;
  const ids = new Set();
  for (const stage of stages) {
    if (!stage || typeof stage.id !== "string" || !stage.id.trim() ||
        typeof stage.agentId !== "string" || !stage.agentId.trim() ||
        typeof stage.role !== "string" || !stage.role.trim() ||
        typeof stage.tool !== "string" || !stage.tool.trim() ||
        ids.has(stage.id)) return false;
    ids.add(stage.id);
  }
  return true;
}

/**
 * One executive objective, one sequential shared evidence ledger, one synthesis.
 * Specialist handlers are injected by the trusted host and dispatched through
 * the governed agent runtime. No provider API, credential, network client,
 * parallel answer stream, or automatic agent activation is created here.
 * The synthesizer may use a local model, but this module does not install or
 * invoke one implicitly.
 */
export function createVegitoExecutiveRuntime({
  registry, handlers, authorize, verify, synthesize, verifySynthesis,
  maxConcurrent = 3, timeoutMs = 30000
} = {}) {
  if (typeof synthesize !== "function" || typeof verifySynthesis !== "function") {
    throw new TypeError("EXECUTIVE_SYNTHESIS_AND_VERIFIER_REQUIRED");
  }
  const host = createGovernedAgentHost({
    registry, handlers, authorize, verify, maxConcurrent, timeoutMs
  });

  return Object.freeze({
    mode: "vegito-shared-state-executive",
    readiness: host.readiness,
    roster: host.roster,
    unavailable: host.unavailable,
    audit: host.audit,
    async run({ objective, stages, approval, signal } = {}) {
      if (typeof objective !== "string" || !objective.trim() || objective.length > MAX_OBJECTIVE_CHARS) {
        return { status: "BLOCKED", reason: "OBJECTIVE_INVALID", specialistRuns: 0 };
      }
      if (!validPlan(stages)) {
        return { status: "BLOCKED", reason: "SPECIALIST_PLAN_INVALID", specialistRuns: 0 };
      }

      const traceId = randomUUID();
      const ledger = [];
      const artifacts = [];
      let specialistRuns = 0;

      // Sequential by design: each worker receives the same objective plus
      // every validated evidence item and artifact produced before it.
      for (let index = 0; index < stages.length; index++) {
        const stage = stages[index];
        let execution;
        try {
          execution = await host.runtime.run({
            agentId: stage.agentId,
            role: stage.role,
            approval,
            signal,
            task: {
              objective: objective.trim(),
              tool: stage.tool,
              input: freezeDeep(structuredClone({
                traceId, stageId: stage.id, stageIndex: index,
                sharedEvidence: ledger, sharedArtifacts: artifacts
              }))
            }
          });
          specialistRuns++;
        } catch {
          return {
            status: "BLOCKED", reason: "SPECIALIST_STAGE_NOT_COMPLETED",
            failedStage: stage.id, specialistRuns, traceId
          };
        }

        if (execution?.evidence?.status !== "VALIDATED" ||
            !execution.evidence.authorized || !execution.evidence.executed ||
            !execution.evidence.verified ||
            !execution.result || typeof execution.result !== "object" ||
            !("output" in execution.result)) {
          return {
            status: "BLOCKED", reason: "SPECIALIST_EVIDENCE_NOT_VALIDATED",
            failedStage: stage.id, specialistRuns, traceId
          };
        }

        let serialized;
        try { serialized = JSON.stringify(execution.result.output); }
        catch {
          return { status: "BLOCKED", reason: "SPECIALIST_OUTPUT_NOT_SERIALIZABLE", failedStage: stage.id, specialistRuns, traceId };
        }
        if (typeof serialized !== "string" || serialized.length > MAX_ARTIFACT_CHARS) {
          return { status: "BLOCKED", reason: "SPECIALIST_OUTPUT_LIMIT_EXCEEDED", failedStage: stage.id, specialistRuns, traceId };
        }

        ledger.push(Object.freeze({
          stageId: stage.id, agentId: stage.agentId, role: stage.role,
          tool: stage.tool, status: "VALIDATED",
          authorized: true, executed: true, verified: true
        }));
        artifacts.push(Object.freeze({ stageId: stage.id, output: execution.result.output }));
      }

      const sharedState = freezeDeep(structuredClone({
        traceId, objective: objective.trim(), evidence: ledger, artifacts
      }));
      let answer;
      try {
        answer = await synthesize({ objective: objective.trim(), sharedState, signal });
      } catch {
        return { status: "FAILED", reason: "EXECUTIVE_SYNTHESIS_FAILED", specialistRuns, traceId };
      }
      if (typeof answer !== "string" || !answer.trim() || answer.length > MAX_ARTIFACT_CHARS) {
        return { status: "BLOCKED", reason: "EXECUTIVE_OUTPUT_INVALID", specialistRuns, traceId };
      }

      let synthesisVerified = false;
      try {
        synthesisVerified = await verifySynthesis(answer.trim(), {
          objective: objective.trim(), sharedState, traceId
        }) === true;
      } catch { synthesisVerified = false; }
      if (!synthesisVerified) {
        return { status: "BLOCKED", reason: "EXECUTIVE_OUTPUT_NOT_VERIFIED", specialistRuns, traceId };
      }

      return {
        status: "COMPLETED", answer: answer.trim(), specialistRuns, traceId,
        executive: {
          mode: "vegito-shared-state-executive", synthesisCount: 1,
          evidenceStatus: "VALIDATED", sharedLedgerEntries: ledger.length
        }
      };
    }
  });
}
