import type { AgentResponse, Provider, Task } from "./types.js";

export interface CompositeMember {
  providerId: string;
  capabilities: string[];
  utilityScore: number;
  status: "VALIDATED" | "OBSERVED" | "PROPOSED" | "UNPROVEN";
}
export interface CompositePolicy {
  minMembers: number;
  maxMembers: number;
  requireIndependentCritic: boolean;
  parallelize: boolean;
}
export interface CompositeResult {
  taskId: string;
  membersInvoked: string[];
  proposals: AgentResponse[];
  selected: AgentResponse[];
  rejected: AgentResponse[];
  verification: "VALIDATED" | "REJECTED" | "UNPROVEN";
  rationale: string[];
}

type MemberExecution = {
  member: CompositeMember;
  provider: Provider;
  role: string;
};

export class CompositeEngine {
  constructor(
    private readonly providers: Provider[],
    private readonly policy: CompositePolicy = {
      minMembers: 5,
      maxMembers: 7,
      requireIndependentCritic: true,
      parallelize: true,
    },
  ) {}

  selectRoster(members: CompositeMember[]): CompositeMember[] {
    const eligible = members
      .filter(member => member.status === "VALIDATED" || member.status === "OBSERVED")
      .sort((a, b) => b.utilityScore - a.utilityScore);
    const selected: CompositeMember[] = [];
    const seenCapabilities = new Set<string>();
    const seenProviders = new Set<string>();

    for (const member of eligible) {
      // A single provider must never occupy multiple roster slots.
      if (seenProviders.has(member.providerId)) continue;
      const unique = member.capabilities.some(capability => !seenCapabilities.has(capability));
      if (unique || selected.length < this.policy.minMembers) {
        selected.push(member);
        seenProviders.add(member.providerId);
        member.capabilities.forEach(capability => seenCapabilities.add(capability));
      }
      if (selected.length >= this.policy.maxMembers) break;
    }
    return selected;
  }

  async run(
    task: Task,
    roster: CompositeMember[],
    verify: (response: AgentResponse) => boolean,
  ): Promise<CompositeResult> {
    if (roster.length < this.policy.minMembers || roster.length > this.policy.maxMembers) {
      throw new Error(
        "Composite roster must contain " + this.policy.minMembers + "-" + this.policy.maxMembers + " members.",
      );
    }
    const uniqueProviderIds = new Set(roster.map(member => member.providerId));
    if (uniqueProviderIds.size !== roster.length) {
      throw new Error("Composite roster must use distinct providers; duplicate provider IDs are not independent organs.");
    }

    const byId = new Map(this.providers.map(provider => [provider.id, provider]));
    const active: MemberExecution[] = roster.map(member => {
      const provider = byId.get(member.providerId);
      if (!provider) throw new Error("Selected provider is not registered: " + member.providerId);
      return { member, provider, role: member.capabilities[0] ?? "reasoning" };
    });

    const invoke = ({ member, provider, role }: MemberExecution) =>
      provider.execute({
        task,
        role,
        context: { composite: true, roster: roster.map(item => item.providerId) },
      });

    let outcomes: PromiseSettledResult<AgentResponse>[];
    if (this.policy.parallelize) {
      outcomes = await Promise.allSettled(active.map(invoke));
    } else {
      outcomes = [];
      for (const item of active) {
        try {
          outcomes.push({ status: "fulfilled", value: await invoke(item) });
        } catch (reason) {
          outcomes.push({ status: "rejected", reason });
        }
      }
    }

    const records = outcomes.map((outcome, index) => {
      const { member, provider, role } = active[index];
      if (outcome.status === "rejected") {
        const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        const response: AgentResponse = {
          capabilityId: provider.id,
          output: undefined,
          evidence: [{
            source: provider.id,
            claim: "Provider execution failed: " + message,
            status: "REJECTED",
          }],
        };
        return { member, provider, role, response, passed: false, failureReason: provider.id + ": " + message };
      }

      let passed = false;
      let failureReason: string | undefined;
      try {
        passed = verify(outcome.value);
      } catch (reason) {
        failureReason = "Verifier failed for " + provider.id + ": " +
          (reason instanceof Error ? reason.message : String(reason));
      }
      return { member, provider, role, response: outcome.value, passed, failureReason };
    });

    const proposals = records.map(record => record.response);
    const selected = records.filter(record => record.passed).map(record => record.response);
    const rejected = records.filter(record => !record.passed).map(record => record.response);
    const failures = records.flatMap(record => record.failureReason ? [record.failureReason] : []);
    const baseRationale = failures.map(failure => "Isolated failure: " + failure);

    if (!selected.length) {
      return {
        taskId: task.id,
        membersInvoked: active.map(item => item.member.providerId),
        proposals,
        selected: [],
        rejected,
        verification: "REJECTED",
        rationale: [...baseRationale, "No composite output survived verification."],
      };
    }

    const criticVerified = records.some(record =>
      record.passed && /critic|critique|review/i.test(record.role),
    );
    if (this.policy.requireIndependentCritic && !criticVerified) {
      return {
        taskId: task.id,
        membersInvoked: active.map(item => item.member.providerId),
        proposals,
        selected,
        rejected,
        verification: "UNPROVEN",
        rationale: [
          ...baseRationale,
          "An independent critic is required, but no critic output survived execution and verification.",
        ],
      };
    }

    return {
      taskId: task.id,
      membersInvoked: active.map(item => item.member.providerId),
      proposals,
      selected,
      rejected,
      verification: "VALIDATED",
      rationale: [
        ...baseRationale,
        "Independent organs executed.",
        "At least one output passed verification.",
        ...(this.policy.requireIndependentCritic ? ["An independent critic output passed verification."] : []),
      ],
    };
  }
}
