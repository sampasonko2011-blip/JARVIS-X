import type { AgentResponse, Provider, Task } from "./types.js";

export interface CompositeMember { providerId: string; capabilities: string[]; utilityScore: number; status: "VALIDATED" | "OBSERVED" | "PROPOSED" | "UNPROVEN"; }
export interface CompositePolicy { minMembers: number; maxMembers: number; requireIndependentCritic: boolean; parallelize: boolean; }
export interface CompositeResult { taskId: string; membersInvoked: string[]; proposals: AgentResponse[]; selected: AgentResponse[]; rejected: AgentResponse[]; verification: "VALIDATED" | "REJECTED" | "UNPROVEN"; rationale: string[]; }

export class CompositeEngine {
  constructor(private readonly providers: Provider[], private readonly policy: CompositePolicy = { minMembers: 5, maxMembers: 7, requireIndependentCritic: true, parallelize: true }) {}
  selectRoster(members: CompositeMember[]): CompositeMember[] {
    const eligible = members.filter(m => m.status === "VALIDATED" || m.status === "OBSERVED").sort((a,b) => b.utilityScore-a.utilityScore);
    const selected: CompositeMember[] = []; const seen = new Set<string>();
    for (const member of eligible) {
      const unique = member.capabilities.some(c => !seen.has(c));
      if (unique || selected.length < this.policy.minMembers) { selected.push(member); member.capabilities.forEach(c => seen.add(c)); }
      if (selected.length >= this.policy.maxMembers) break;
    }
    return selected;
  }
  async run(task: Task, roster: CompositeMember[], verify: (response: AgentResponse) => boolean): Promise<CompositeResult> {
    if (roster.length < this.policy.minMembers || roster.length > this.policy.maxMembers) throw new Error("Composite roster must contain " + this.policy.minMembers + "-" + this.policy.maxMembers + " members.");
    const byId = new Map(this.providers.map(p => [p.id,p]));
    const active = roster.map(member => { const provider=byId.get(member.providerId); if (!provider) throw new Error("Selected provider is not registered: "+member.providerId); return {member,provider}; });
    const invoke = ({member,provider}) => provider.execute({task, role: member.capabilities[0] ?? "reasoning", context:{composite:true, roster:roster.map(r=>r.providerId)}});
    const proposals = this.policy.parallelize ? await Promise.all(active.map(invoke)) : await active.reduce(async (acc,item)=>[...(await acc),await invoke(item)],Promise.resolve([] as AgentResponse[]));
    const selected=proposals.filter(verify), rejected=proposals.filter(r=>!verify(r));
    if (!selected.length) return {taskId:task.id,membersInvoked:active.map(x=>x.member.providerId),proposals,selected:[],rejected,verification:"REJECTED",rationale:["No composite output survived verification."]};
    const critic=roster.some(m=>m.capabilities.some(c=>/critic|critique|review/i.test(c)));
    if (this.policy.requireIndependentCritic && !critic) return {taskId:task.id,membersInvoked:active.map(x=>x.member.providerId),proposals,selected,rejected,verification:"UNPROVEN",rationale:["Independent critic capability is required but absent."]};
    return {taskId:task.id,membersInvoked:active.map(x=>x.member.providerId),proposals,selected,rejected,verification:"VALIDATED",rationale:["Independent organs executed.","At least one output passed verification.","Independent critic capability was present."]};
  }
}