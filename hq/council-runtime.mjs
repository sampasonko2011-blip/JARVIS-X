/**
 * JARVIS-X Multi-AI Council runtime.
 *
 * Executes only explicitly supplied adapters that satisfy the authorization
 * and live-test gates. This module does not discover providers, read secrets,
 * or create network connections itself. Provider adapters are supplied by a
 * later authorized server-side integration.
 */

const MAX_OBJECTIVE_CHARS = 12000;
const MAX_REPLY_CHARS = 60000;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function eligibleProvider(provider) {
  return Boolean(
    provider &&
    typeof provider.id === "string" && provider.id.trim() &&
    typeof provider.modelId === "string" && provider.modelId.trim() &&
    provider.authorized === true &&
    provider.liveTestPassed === true &&
    provider.status === "WORLD_STATE_VERIFIED" &&
    typeof provider.invoke === "function"
  );
}

function safeError(error) {
  // Never persist arbitrary error messages: they may contain credentials or prompts.
  const name = error && typeof error.name === "string" ? error.name.slice(0, 80) : "Error";
  return { name, message: "Provider invocation failed; raw error details were intentionally redacted." };
}

async function invokeBounded(provider, payload, timeoutMs) {
  const controller = new AbortController();
  let timeout;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => provider.invoke(payload, { signal: controller.signal })),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const error = new Error("Provider timeout");
          error.name = "TimeoutError";
          reject(error);
        }, timeoutMs);
      }),
    ]);
    const reply = cleanText(result?.text, MAX_REPLY_CHARS);
    if (!reply) return { ok: false, reason: "EMPTY_OR_INVALID_REPLY" };
    return {
      ok: true,
      reply,
      receipt: {
        providerId: provider.id,
        modelId: provider.modelId,
        requestId: cleanText(result?.requestId, 200) || null,
        latencyMs: Number.isFinite(result?.latencyMs) && result.latencyMs >= 0 ? result.latencyMs : null,
      },
    };
  } catch (error) {
    return { ok: false, reason: error?.name === "TimeoutError" ? "TIMEOUT" : "PROVIDER_ERROR", error: safeError(error) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function makeStagePrompt(role, objective, context = {}) {
  if (role === "lead") {
    return {
      role,
      objective,
      instructions: "Solve the objective. Separate facts, inferences, assumptions, and unknowns. Include evidence references when available. Do not invent sources.",
    };
  }
  if (role === "critic") {
    return {
      role,
      objective,
      leadAnswer: context.leadAnswer,
      instructions: "Independently challenge the lead answer. Identify unsupported claims, counterevidence, missing alternatives, and what would falsify the answer. Do not merely agree.",
    };
  }
  return {
    role: "synthesizer",
    objective,
    leadAnswer: context.leadAnswer,
    critique: context.critique,
    instructions: "Synthesize the lead and independent critique. Preserve disagreements and unknowns. Do not imply consensus where the evidence conflicts.",
  };
}

/**
 * Run a lead -> independent critic -> synthesizer council.
 * Requires three distinct provider IDs by default. No provider is invoked unless
 * all participating adapters have explicit authorization and live-test evidence.
 */
export async function runCouncil({
  objective,
  providers = [],
  requireIndependentCritic = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date().toISOString(),
} = {}) {
  const task = cleanText(objective, MAX_OBJECTIVE_CHARS);
  if (!task) return { status: "BLOCKED", reason: "OBJECTIVE_REQUIRED", stages: [], providerCalls: 0 };
  if (task.length >= MAX_OBJECTIVE_CHARS) return { status: "BLOCKED", reason: "OBJECTIVE_TOO_LONG", stages: [], providerCalls: 0 };
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
    return { status: "BLOCKED", reason: "INVALID_TIMEOUT", stages: [], providerCalls: 0 };
  }

  const unique = [];
  const seenProviderIds = new Set();
  const seenModelIds = new Set();
  for (const provider of providers) {
    if (!eligibleProvider(provider)) continue;
    // Require distinct provider and model identities to reduce false independence.
    if (seenProviderIds.has(provider.id) || seenModelIds.has(provider.modelId)) continue;
    unique.push(provider);
    seenProviderIds.add(provider.id);
    seenModelIds.add(provider.modelId);
  }
  const needed = requireIndependentCritic ? 3 : 2;
  if (unique.length < needed) {
    return {
      status: "MANUAL_HANDOFF",
      reason: "INSUFFICIENT_VERIFIED_AUTHORIZED_PROVIDERS",
      stages: [],
      providerCalls: 0,
      eligibleProviderIds: unique.map((p) => p.id),
      limitation: "No provider was invoked. Supply distinct authorized, live-tested adapters to enable the council.",
    };
  }

  const leadProvider = unique[0];
  const criticProvider = requireIndependentCritic ? unique.find((p) => p.id !== leadProvider.id) : null;
  const synthesizerProvider = unique.find((p) => p.id !== leadProvider.id && p.id !== criticProvider?.id);
  const stages = [];
  let providerCalls = 0;

  const lead = await invokeBounded(leadProvider, makeStagePrompt("lead", task), timeoutMs);
  providerCalls++;
  stages.push({ role: "lead", providerId: leadProvider.id, status: lead.ok ? "EXECUTED" : "FAILED", ...(lead.ok ? { receipt: lead.receipt } : { reason: lead.reason, error: lead.error }) });
  if (!lead.ok) {
    return { status: "FAILED", reason: "LEAD_STAGE_FAILED", stages, providerCalls, timestamp: now() };
  }

  let critique = null;
  if (criticProvider) {
    critique = await invokeBounded(criticProvider, makeStagePrompt("critic", task, { leadAnswer: lead.reply }), timeoutMs);
    providerCalls++;
    stages.push({ role: "critic", providerId: criticProvider.id, status: critique.ok ? "EXECUTED" : "FAILED", ...(critique.ok ? { receipt: critique.receipt } : { reason: critique.reason, error: critique.error }) });
    if (!critique.ok) {
      return {
        status: "PARTIAL",
        reason: "INDEPENDENT_CRITIC_FAILED",
        leadAnswer: lead.reply,
        stages,
        providerCalls,
        timestamp: now(),
        limitation: "No final synthesis produced; a single model answer is not represented as a completed council.",
      };
    }
  }

  const synthesis = await invokeBounded(
    synthesizerProvider,
    makeStagePrompt("synthesizer", task, { leadAnswer: lead.reply, critique: critique?.reply ?? "Independent critic disabled by configuration." }),
    timeoutMs
  );
  providerCalls++;
  stages.push({ role: "synthesizer", providerId: synthesizerProvider.id, status: synthesis.ok ? "EXECUTED" : "FAILED", ...(synthesis.ok ? { receipt: synthesis.receipt } : { reason: synthesis.reason, error: synthesis.error }) });

  if (!synthesis.ok) {
    return {
      status: "PARTIAL",
      reason: "SYNTHESIS_FAILED",
      leadAnswer: lead.reply,
      ...(critique?.ok ? { critique: critique.reply } : {}),
      stages,
      providerCalls,
      timestamp: now(),
      limitation: "Raw stage outputs are retained for review; no completed synthesis is claimed.",
    };
  }

  return {
    status: "COMPLETED",
    objective: task,
    answer: synthesis.reply,
    leadAnswer: lead.reply,
    ...(critique?.ok ? { critique: critique.reply } : {}),
    stages,
    providerCalls,
    timestamp: now(),
    evidenceBoundary: "Provider calls completed through injected adapters. This runtime does not independently verify factual correctness or external world state.",
  };
}
