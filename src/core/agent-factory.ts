import type { LedgerEntry } from "./types.js";
import { EvidenceLedger } from "./ledger.js";

export type AgentDomain = "school" | "football" | "code" | "research" | "general";
export type AgentClaimStatus = "OBSERVED" | "VALIDATED" | "PROPOSED" | "UNPROVEN" | "REJECTED" | "SUPERSEDED";

export interface FactoryTask {
  id: string;
  objective: string;
  domain: AgentDomain;
  depth: number;
  constraints: string[];
  parentId?: string;
}

export interface FactoryBudget {
  maxInvocations: number;
  maxDepth: number;
  maxChildrenPerTask: number;
  maxOutputChars: number;
  estimatedSpendEUR: 0;
}

export interface FactoryExecution {
  task: FactoryTask;
  signal: AbortSignal;
}

export interface FactoryAgentOutput {
  agentId: string;
  content: string;
  evidence: Array<{ claim: string; status: AgentClaimStatus; source?: string }>;
}

export interface SaboteurFinding {
  passed: boolean;
  findings: string[];
}

export interface AgentFactoryOptions {
  budget?: Partial<FactoryBudget>;
  ledger?: EvidenceLedger;
  decompose(task: FactoryTask): Promise<FactoryTask[]> | FactoryTask[];
  execute(input: FactoryExecution): Promise<FactoryAgentOutput>;
  saboteur(task: FactoryTask, output: FactoryAgentOutput): Promise<SaboteurFinding> | SaboteurFinding;
  synthesize(task: FactoryTask, accepted: FactoryAgentOutput[]): Promise<string> | string;
  timeoutMs?: number;
}

export interface AgentFactoryResult {
  taskId: string;
  output: string;
  status: "VALIDATED" | "UNPROVEN" | "REJECTED";
  plannedTasks: number;
  invokedAgents: string[];
  acceptedAgents: string[];
  rejectedAgents: string[];
  estimatedSpendEUR: 0;
  findings: string[];
  lifecycle: "APOPTOSIS_COMPLETED";
}

const DEFAULT_BUDGET: FactoryBudget = {
  maxInvocations: 8,
  maxDepth: 2,
  maxChildrenPerTask: 4,
  maxOutputChars: 10_000,
  estimatedSpendEUR: 0
};

const DOMAIN_AGENT: Record<AgentDomain, string> = {
  school: "SchoolAgent",
  football: "FootballAgent",
  code: "CodeAgent",
  research: "ResearchAgent",
  general: "ExecutiveAgent"
};

function validateTask(task: FactoryTask): void {
  if (!task || typeof task.id !== "string" || !/^[a-zA-Z0-9._-]{1,80}$/.test(task.id)) {
    throw new TypeError("factory_task_id_invalid");
  }
  if (typeof task.objective !== "string" || !task.objective.trim() || task.objective.length > 2_000) {
    throw new TypeError("factory_task_objective_invalid");
  }
  if (!["school", "football", "code", "research", "general"].includes(task.domain)) {
    throw new TypeError("factory_task_domain_invalid");
  }
  if (!Number.isInteger(task.depth) || task.depth < 0) throw new TypeError("factory_task_depth_invalid");
  if (!Array.isArray(task.constraints) || task.constraints.length > 20 ||
      task.constraints.some(value => typeof value !== "string" || value.length > 500)) {
    throw new TypeError("factory_task_constraints_invalid");
  }
}

function normalizeBudget(input: Partial<FactoryBudget> = {}): FactoryBudget {
  const budget = { ...DEFAULT_BUDGET, ...input };
  const bounds: Array<[keyof FactoryBudget, number, number]> = [
    ["maxInvocations", 1, 32],
    ["maxDepth", 0, 3],
    ["maxChildrenPerTask", 1, 6],
    ["maxOutputChars", 100, 20_000]
  ];
  for (const [key, min, max] of bounds) {
    const value = budget[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new RangeError("factory_budget_invalid_" + key);
    }
  }
  if (budget.estimatedSpendEUR !== 0) throw new Error("factory_nonzero_spend_forbidden");
  return budget;
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("factory_agent_timeout"));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Runs ephemeral, domain-scoped task agents under one bounded executive.
 * Agent output is untrusted until the independent Saboteur callback passes.
 * Cleanup drops references; it does not claim secure erasure from JS memory.
 */
export async function runAgentFactory(
  root: FactoryTask,
  options: AgentFactoryOptions
): Promise<AgentFactoryResult> {
  validateTask(root);
  if (root.depth !== 0 || root.parentId) throw new TypeError("factory_root_must_be_depth_zero");
  const budget = normalizeBudget(options.budget);
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
    throw new RangeError("factory_timeout_invalid");
  }

  const ledger = options.ledger ?? new EvidenceLedger();
  const ids = new Set<string>([root.id]);
  const planned: FactoryTask[] = [root];
  const queue: FactoryTask[] = [root];
  const findings: string[] = [];
  const outputs: FactoryAgentOutput[] = [];
  const accepted: FactoryAgentOutput[] = [];
  const invoked: string[] = [];
  const rejected: string[] = [];

  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= budget.maxDepth) continue;
    const children = await options.decompose(structuredClone(current));
    if (!Array.isArray(children) || children.length > budget.maxChildrenPerTask) {
      throw new Error("factory_decomposition_limit_exceeded");
    }
    for (const child of children) {
      validateTask(child);
      if (child.depth !== current.depth + 1 || child.parentId !== current.id) {
        throw new Error("factory_child_hierarchy_invalid");
      }
      if (ids.has(child.id)) throw new Error("factory_duplicate_task_id");
      ids.add(child.id);
      planned.push(structuredClone(child));
      queue.push(structuredClone(child));
      if (planned.length > budget.maxInvocations) throw new Error("factory_invocation_budget_exceeded");
    }
  }

  const leaves = planned.filter(task => !planned.some(candidate => candidate.parentId === task.id));
  for (const task of leaves) {
    if (invoked.length >= budget.maxInvocations) throw new Error("factory_invocation_budget_exceeded");
    const agentId = DOMAIN_AGENT[task.domain];
    invoked.push(agentId + ":" + task.id);
    const base: LedgerEntry = {
      objective: task.objective,
      constraints: [...task.constraints, "estimated_spend=0 EUR", "ephemeral_agent=true"],
      capabilitiesAvailable: Object.values(DOMAIN_AGENT),
      capabilitiesInvoked: [agentId],
      capabilitiesExecuted: [],
      verification: "UNPROVEN",
      errors: [],
      decision: "UNPROVEN"
    };

    try {
      const output = await withTimeout(signal => options.execute({ task: structuredClone(task), signal }), timeoutMs);
      if (!output || typeof output.agentId !== "string" || typeof output.content !== "string" ||
          output.content.length > budget.maxOutputChars || !Array.isArray(output.evidence)) {
        throw new Error("factory_agent_output_invalid");
      }
      const critique = await withTimeout(
        () => Promise.resolve(options.saboteur(structuredClone(task), structuredClone(output))),
        timeoutMs
      );
      if (!critique || typeof critique.passed !== "boolean" || !Array.isArray(critique.findings)) {
        throw new Error("factory_saboteur_output_invalid");
      }
      findings.push(...critique.findings.map(item => String(item).slice(0, 500)));
      outputs.push(output);
      if (critique.passed) {
        accepted.push(output);
        ledger.record({ ...base, capabilitiesExecuted: [output.agentId], verification: "VALIDATED",
          errors: [], decision: "VALIDATED", outcome: "SaboteurAgent accepted bounded output" });
      } else {
        rejected.push(output.agentId);
        ledger.record({ ...base, capabilitiesExecuted: [output.agentId], verification: "REJECTED",
          errors: critique.findings.map(item => String(item).slice(0, 500)), decision: "REJECTED" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      findings.push(task.id + ": " + message);
      rejected.push(agentId);
      ledger.record({ ...base, verification: "REJECTED", errors: [message], decision: "REJECTED" });
    }
  }

  let output = "";
  let status: AgentFactoryResult["status"] = "REJECTED";
  if (accepted.length) {
    output = await options.synthesize(structuredClone(root), structuredClone(accepted));
    if (typeof output !== "string" || output.length > budget.maxOutputChars) {
      throw new Error("factory_synthesis_output_invalid");
    }
    status = rejected.length === 0 ? "VALIDATED" : "UNPROVEN";
  }

  const result: AgentFactoryResult = {
    taskId: root.id,
    output,
    status,
    plannedTasks: planned.length,
    invokedAgents: [...invoked],
    acceptedAgents: accepted.map(item => item.agentId),
    rejectedAgents: [...rejected],
    estimatedSpendEUR: 0,
    findings: [...findings],
    lifecycle: "APOPTOSIS_COMPLETED"
  };

  // Ephemeral outputs are intentionally not returned; only the single synthesis
  // and redacted status/evidence summary survive this scope.
  outputs.length = 0;
  accepted.length = 0;
  planned.length = 0;
  queue.length = 0;
  return result;
}
