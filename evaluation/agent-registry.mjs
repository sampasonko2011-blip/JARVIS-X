/**
 * Provider-neutral specialist-agent registry.
 * Registration is declarative only: it does not authenticate, invoke tools, or grant
 * permissions. Every invocation requires an explicit task scope and policy decision.
 */
const ALLOWED_STATUS = new Set(["OBSERVED","VALIDATED"]);
const SAFE_ROLES = new Set(["reasoning","coding","research","critique","verification","planning","memory-analysis","tool-orchestration","security-review","benchmarking"]);
const SAFE_TOOL_CLASSES = new Set(["read-only","local-test","mock"]);
const norm = value => String(value ?? "").trim().toLowerCase();

export class AgentRegistry {
  #agents = new Map();
  #authorize;
  constructor({ authorize = async () => false } = {}) {
    if (typeof authorize !== "function") throw new TypeError("A trusted authorization verifier is required");
    this.#authorize = authorize;
  }
  register(agent) {
    if (!agent || typeof agent.id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(agent.id)) throw new TypeError("Invalid agent id");
    if (this.#agents.has(agent.id)) throw new Error("Duplicate agent id");
    if (!agent.independenceGroup || !agent.owner || !ALLOWED_STATUS.has(agent.status)) throw new Error("Agent requires owner, independence group and OBSERVED/VALIDATED evidence");
    if (!Array.isArray(agent.roles) || !agent.roles.length || agent.roles.some(r => !SAFE_ROLES.has(norm(r)))) throw new Error("Unsupported agent role");
    if (!Array.isArray(agent.tools ?? []) || (agent.tools ?? []).some(t => !SAFE_TOOL_CLASSES.has(norm(t)))) throw new Error("Agent requests an unapproved tool class");
    if (typeof agent.execute !== "function") throw new TypeError("Agent requires an injected executor");
    this.#agents.set(agent.id, Object.freeze({...agent, roles:[...new Set(agent.roles.map(norm))], tools:[...(agent.tools ?? [])]}));
    return this.describe(agent.id);
  }
  describe(id) {
    const a=this.#agents.get(id); if(!a)return null;
    return {id:a.id,provider:a.provider ?? null,independenceGroup:a.independenceGroup,owner:a.owner,status:a.status,roles:[...a.roles],tools:[...(a.tools ?? [])]};
  }
  list() { return [...this.#agents.keys()].sort().map(id=>this.describe(id)); }
  eligible({role, task, allowedIndependenceGroups=[]}={}) {
    if(!task || typeof task.objective!=="string" || !task.objective.trim()) throw new TypeError("A non-empty task objective is required");
    return [...this.#agents.values()].filter(a=>a.roles.includes(norm(role)) &&
      (allowedIndependenceGroups.length===0 || allowedIndependenceGroups.includes(a.independenceGroup)))
      .map(a=>this.describe(a.id));
  }
  async invoke(id, {task, role, approvedScope, signal}={}) {
    const a=this.#agents.get(id);
    if(!a) throw new Error("Unknown agent");
    if(!task || typeof task.objective!=="string" || !task.objective.trim()) throw new TypeError("A non-empty task objective is required");
    if(!approvedScope || approvedScope.action!=="agent.invoke" || approvedScope.resource!==id ||
       approvedScope.scope!==id+":"+norm(role) || typeof task.digest!=="string" || !task.digest ||
       typeof task.authenticatedSubject!=="string" || !task.authenticatedSubject ||
       approvedScope.taskDigest!==task.digest || approvedScope.subject!==task.authenticatedSubject) {
      throw new Error("Exact-scope approval required");
    }
    if(!a.roles.includes(norm(role))) throw new Error("Agent is not registered for requested role");
    if(await this.#authorize({agentId:id,role:norm(role),task,approvedScope}) !== true) {
      throw new Error("Trusted authorization verifier denied invocation");
    }
    const result=await a.execute({task,role:norm(role),signal});
    if(!result || typeof result.output!=="string" || !result.output.trim()) throw new Error("Agent returned no usable output");
    return {agentId:id,independenceGroup:a.independenceGroup,output:result.output,
      evidence:{status:"OBSERVED",source:"agent:"+id,claim:"Agent returned a response; correctness remains unverified."}};
  }
}
