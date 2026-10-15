# Live model mini-benchmark

This is a bounded, opt-in smoke test for a specific registry candidate. It is not a leaderboard and must not automatically promote models.

## Run one exact candidate

Set the provider's API credential in your local environment, then run:

```bash
JX_LIVE_BENCHMARK=1 npm run benchmark:live -- --candidate google-gemini-3.8-flash
```

Pass another `--candidate ID` to evaluate another exact registry entry. Each selected text candidate receives three fixed prompts: exact arithmetic, logical entailment, and uncertainty calibration. Calls are sequential and the script does not automatically benchmark the whole registry.

## Identity and modality rules

- The provider-returned model ID must exactly match the registry ID to count as an identity-verified pass.
- Missing or mismatched response IDs produce `IDENTITY_UNVERIFIED_OR_MISMATCH`, never a passing score.
- Image, audio, embedding, reranking, and other non-text specialist candidates are rejected by this text-only benchmark.
- Provider credentials are read from environment variables only and are never printed.
- Live API calls may incur charges or consume quota. They are disabled unless `JX_LIVE_BENCHMARK=1` is set explicitly.
- Results are written to standard output only; no registry candidate is modified or promoted.

## What this does not prove

Three checks cannot establish broad reasoning, coding, safety, speed, cost, privacy, or superiority. Use larger repeated tests, a held-out set, task-specific rubrics, latency/cost evidence, and human review before changing routing weights or candidate status.
