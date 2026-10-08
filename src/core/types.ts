export type ClaimStatus = "OBSERVED" | "VALIDATED" | "PROPOSED" | "UNPROVEN" | "REJECTED" | "SUPERSEDED";
export type CapabilityKind = "reasoning" | "coding" | "research" | "vision" | "critique" | "execution" | "memory";

export interface Task { id: string; objective: string; constraints?: string[]; inputs?: unknown; }
export interface Capability { id: string; kind: CapabilityKind; strengths: string[]; limits?: string[]; metadata?: Record<string, unknown>; }
export interface AgentRequest { task: Task; role: string; context: Record<string, unknown>; }
export interface AgentResponse { capabilityId: string; output: unknown; evidence?: Evidence[]; confidence?: number; }
export interface Evidence { source: string; claim: string; status: ClaimStatus; details?: string; }
export interface LedgerEntry { objective: string; constraints: string[]; baseline?: string; capabilitiesAvailable: string[]; capabilitiesInvoked: string[]; capabilitiesExecuted: string[]; verification?: string; outcome?: string; errors: string[]; confidence?: number; lesson?: string; intervention?: string; retest?: string; decision?: string; }
export interface Provider { id: string; capabilities: Capability[]; execute(request: AgentRequest): Promise<AgentResponse>; }
