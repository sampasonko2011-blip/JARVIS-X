# Provider-neutral model routing

JARVIS-X owns capability selection, orchestration, memory, evidence, and verification. A provider is an interchangeable execution organ, not the system's source of truth.

## FreeLLMpool adapter

The `OpenAICompatibleProvider` can target a local FreeLLMpool proxy or another OpenAI-compatible gateway. Install and run FreeLLMpool separately using its official instructions: https://github.com/0xzr/freellmpool. Bind it to loopback (the documented default is `http://localhost:8080`), then configure JARVIS-X with a model alias exposed by that gateway.

Example TypeScript:

```ts
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";

const freePool = new OpenAICompatibleProvider("freellmpool", {
  baseUrl: process.env.JX_LLM_BASE_URL ?? "http://127.0.0.1:8080/v1",
  model: process.env.JX_LLM_MODEL ?? "auto",
  apiKey: process.env.JX_LLM_API_KEY, // omit for a local proxy that does not require auth
  costClass: "verified-zero-cost",
});
```

Register it with the existing `CapabilityRegistry` just like any other `Provider`. This adapter does not install, launch, or authenticate to FreeLLMpool automatically.

## Zero-cost policy and important limits

- The adapter blocks `paid`, `trial`, and `unknown` cost classes by default. The `verified-zero-cost` value is an operator assertion, **not live price verification**. Before setting it, verify the exact upstream route and its current terms in the gateway's capacity/catalog output and provider terms.
- FreeLLMpool pools upstream routes; it does not make every catalog entry free, permanently available, private, or frontier-quality. A keyless route can disappear or impose limits. Do not treat model catalog size as proof of healthy usable models.
- Prompts go to the selected upstream provider. Do not send secrets, school records, private source code, or other sensitive content unless the provider's current data policy permits it.
- Keep the proxy bound to loopback unless you configure authentication and understand the network exposure. Never commit provider credentials. Use environment variables or a secret manager.
- The adapter sends a normal chat-completions request and marks its output `OBSERVED`, not `VALIDATED`. JARVIS-X task-specific verification and comparative evaluation remain required.
- Local Ollama can be used through the same interface by pointing `baseUrl` to a loopback OpenAI-compatible endpoint and using an installed model. This is local inference, not a guarantee of strong quality or zero electricity cost.

## Verification plan

1. Run `npm run build && npm test` for deterministic adapter/guard tests.
2. Start a local gateway and run a harmless synthetic task, then verify the exact upstream model/provider from gateway diagnostics.
3. Check that the selected route is recurring zero-price capacity, not trial credit or a paid fallback.
4. Compare against a fixed task set and score output blind with the same rubric. Record latency, errors, tokens/limits, route identity, and human-scored quality. Do not claim the composite is better until a comparable retest supports it.
