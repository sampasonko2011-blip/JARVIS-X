# Cross-provider capability profiles

JARVIS-X presents one command surface over declarative specialist capability profiles. A profile describes the *kind of work* a specialist is intended to perform; it is not a provider connection and does not imply that an external model has been invoked.

## Example aliases

| Input | Intended capability profile |
|---|---|
| `claude` | Long-context engineering, architecture, code review |
| `gpt` / `chatgpt` | General reasoning, planning, synthesis |
| `gemini` | Multimodal and document-analysis workflows |
| `perplexity` | Grounded web research and citation checking |
| `deepseek` | Reasoning, algorithm design and coding |
| `qwen` | Multilingual reasoning and structured extraction |
| `llama` | Local/offline and open-model workflow design |
| `mistral` | Efficient reasoning and coding assistance |
| `grok` | Live-context and trend-analysis workflows |
| `copilot` | Repository and pull-request coding workflows |

These are capability/style mappings, not claims about proprietary model internals, equivalence, or vendor access. The catalog is extensible; names are aliases, not dependencies.

## Resolution

The metadata-only resolver accepts a profile ID, label, or alias. For example:

```js
import { resolveAgentProfile } from "../evaluation/agent-profile-router.mjs";
const selected = resolveAgentProfile(registry, "claude");
```

It returns `PROFILE_ONLY` unless the matching agent is explicitly enabled, has eligible evidence (`OBSERVED` or `VALIDATED`), and the profile execution gate is enabled. Resolution itself never invokes a model, tool, provider or agent.

## What real execution requires

A provider-backed profile must not become executable until its adapter is separately connected and authenticated, its allowed tools/data scope are least-privilege, each task has principal-bound approval, and the governed host enforces independent output verification plus durable audit/replay controls. Missing dependencies must fail closed. External-provider usage may incur cost and requires explicit user authorization.

The host application can use the same portable profile registry and resolver regardless of whether its interface is ChatGPT, Claude, another assistant, or a standalone JARVIS-X client. This is a portability contract for the profile metadata and command vocabulary—not automatic memory migration, universal runtime compatibility, or access to another host's private tools.

## Custom agent roster and provider adapters

The built-in six agent records are architectural candidates and are currently `DISABLED` / `PROPOSED`. They are not the user's actively connected provider roster. The ten named AI aliases above are profile metadata only.

The composite bridge is provider-neutral: an authorized host may inject an executor under any registered agent ID. This allows an operator to add a Claude API adapter, Gemini adapter, a self-hosted model endpoint, a company agent, or a future provider without changing the shared capability contract. The adapter must be implemented and authenticated by the deployment owner; registration does not create an account, API key, vendor access, or permission.

Minimal executor contract:

```js
const adapters = {
  "my-claude-agent": async ({ task, role, context, signal, allowedTools, dataAccessScope }) => {
    // Call only the provider endpoint configured by the deployment owner.
    // Return structured output; never expose credentials to the caller.
    return { output: { summary: "..." }, evidence: [] };
  }
};
```

Register the corresponding agent with a unique real `independenceGroup`, explicit `owner`, eligible evidence, declared roles, least-privilege tools and data scope. Inject the adapter into `createCompositeAgentBindings`; require trusted task authorization for every invocation. Prefer the shared governed runtime, with allowlisted handlers, task-bound approval, independent verification and durable audit/replay. Never mark a provider connected merely because its alias or adapter slot exists.

A user-facing request such as `/agent claude review this diff` can select the Claude-style profile in the JARVIS-X host. It invokes an actual Claude-backed agent only if that host has a separately configured, authenticated, enabled adapter and the exact task is approved. Otherwise it must report `PROFILE_ONLY` / unavailable and continue only with capabilities actually available in the current host.

## Portability boundary

The registry, aliases, role vocabulary, task envelope and evidence format are designed to be portable across JARVIS-X clients. An assistant interface does not automatically inherit another interface's private conversation history, connector credentials, plugins, tools, or runtime. A Claude client and ChatGPT client can each host JARVIS-X-compatible adapters, but each host must separately configure its own authenticated connections and import the portable memory bundle when desired.

## Model improvement, replacement and composition governance

JARVIS-X may continuously identify candidate models and adapters for a capability, but discovery is not activation. A candidate must have an explicit provider/model identity, verified adapter and authentication state, declared permissions, cost/latency envelope, and task-relevant evaluation evidence. Compare it against the current baseline on representative tasks, then run held-out retests, independent verification and security/privacy/cost regression checks.

The system may recommend **KEEP**, **MODIFY**, **REPLACE** or **COMPOSE**. Replacement and provider activation remain proposals until the user approves the consequential change. Composition is appropriate when specialists provide complementary, non-duplicative capabilities through interoperable scoped task contracts; outputs enter one shared evidence ledger and one JARVIS-X synthesis. A second model from the same operator is not automatically an independent verifier. No brand, marketing benchmark or untested claim is sufficient to promote a candidate.
