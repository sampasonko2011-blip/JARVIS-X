# JARVIS-X Composite Engine

`evaluation/composite-engine.mjs` is the model-agnostic execution layer for role-based routing and response fusion.

## How it works

1. It only considers candidates with a `VALIDATED` registry status, an explicitly callable adapter, and a scorecard marked `VALIDATED`.
2. It requires at least 20 fixed holdout cases by default, measured task/holdout pass rates, failure rate, latency, and cost.
3. It calls the best-scoring eligible adapters in parallel, records each result/failure and provenance, then hands successful outputs to an explicitly supplied synthesis adapter.
4. It refuses to route if no validated callable candidate exists. It never silently substitutes a proposed model.
5. Execution success is not model-quality validation; candidate promotion still requires a blind benchmark and comparable holdout retest.

## Current limitation

This repository does not currently contain authenticated provider adapters for ChatGPT, Claude, Gemini, or DeepSeek. The engine is implemented and testable with injected adapters, but real cross-provider fusion remains **UNPROVEN** until provider credentials/routes are configured outside the registry and live runs are recorded. Never commit API keys.
