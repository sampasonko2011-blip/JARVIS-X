import type { AgentRequest, AgentResponse, Provider } from "../core/types.js";

export const mockProvider: Provider = {
  id: "mock",
  capabilities: [
    {id:"mock:reasoning",kind:"reasoning",strengths:["reasoning","planning"]},
    {id:"mock:critique",kind:"critique",strengths:["critique","verification"]}
  ],
  async execute(request: AgentRequest): Promise<AgentResponse> {
    return {capabilityId:`mock:${request.role}`, output:{taskId:request.task.id, role:request.role, objective:request.task.objective}};
  }
};
