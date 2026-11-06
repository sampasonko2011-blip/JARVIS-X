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
