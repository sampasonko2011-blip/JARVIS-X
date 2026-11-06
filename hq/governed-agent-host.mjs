/**
 * HQ host composition boundary for governed specialist agents.
 *
 * This factory wires the registry, shared governed runtime and composite provider
 * bridge into one host-owned object. It does not connect credentials, discover
 * agents, enable registry entries, or perform network/production actions.
 * The host must inject narrow handlers, authenticated authorization and an
 * independent verifier. Defaults remain deny-by-default.
 */
import { createAgentRuntime } from "../evaluation/agent-runtime.mjs";
import { createCompositeAgentBindings, evaluateAgentReadiness } from "../evaluation/composite-agent-bridge.mjs";

export function createGovernedAgentHost({
  registry,
  handlers,
  authorize = async () => false,
  verify = async () => false,
  maxConcurrent = 3,
  timeoutMs = 30000,
  maxAuditEntries = 500
} = {}) {
  if (!registry || !Array.isArray(registry.agents)) throw new TypeError("A declared agent registry is required.");
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) throw new TypeError("Host-injected handler map is required.");
  if (typeof authorize !== "function" || typeof verify !== "function") throw new TypeError("Trusted authorization and independent verification callbacks are required.");

  const runtime = createAgentRuntime({
    registry, handlers, authorize, verify, maxConcurrent, timeoutMs, maxAuditEntries
  });
  const bindings = createCompositeAgentBindings(registry, undefined, { runtime });
  const readiness = evaluateAgentReadiness(bindings, 1);

  return Object.freeze({
    providers: Object.freeze([...bindings.providers]),
    roster: Object.freeze([...bindings.roster]),
    unavailable: Object.freeze([...bindings.unavailable]),
    readiness: Object.freeze({ ...readiness }),
    runtime,
    audit: () => runtime.audit()
  });
}
