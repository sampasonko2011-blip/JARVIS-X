# Model scout runbook

The scout harness is opt-in and makes no calls unless the operator supplies a local candidate file with `enabled: true` candidates. Do not commit that file: it can contain private endpoint names. Use environment variables for keys.

## Candidate file format

Create `evaluation/scout-candidates.local.json` locally:

```json
{
  "candidates": [
    {
      "id": "local-ollama",
      "enabled": true,
      "baseUrl": "http://127.0.0.1:11434/v1",
      "model": "YOUR_INSTALLED_MODEL",
      "apiKeyEnv": "",
      "costClass": "verified-zero-cost"
    }
  ]
}
```

The zero-cost class is an operator assertion. A local runtime has no per-request API charge but uses compute/electricity. For hosted routes, verify recurring pricing and exact upstream route first; if the gateway cannot prove the route and price, do not use it in free-only mode.

Run with `npm run scout:models`. Defaults: maximum 15 calls, 160 output tokens per call, 30-second timeout, free-only mode. Tune only within the hard limits in the script. Set `JX_SCOUT_FREE_ONLY=0` only if intentionally comparing paid/unknown routes and have independently approved spend controls. The report includes raw model outputs, so keep it local and private; it is written with owner-only permissions where supported.

## Blind scoring

The report uses randomized blind IDs and retains the identity mapping for auditability. To avoid bias, copy outputs to a separate scoring sheet, hide the mapping, and score each task 0-4 for correctness, constraint compliance, evidence discipline, actionability, and safety. Compare mean and per-task results; don't promote on a tiny mean difference or one task. Re-run the same fixed set and a holdout set. Record latency and failure rate alongside quality.

## Limitations

- This harness does not verify upstream provider identity, live price, privacy terms, model weights, or paid fallback. Those require separate evidence from gateway/provider diagnostics.
- A successful HTTP response proves endpoint behavior, not correctness.
- The randomized blind ID mapping is included in the local report for traceability; blind evaluators must not receive that mapping until scoring is locked.
- No automatic winner selection is implemented intentionally. A human-reviewed promotion gate is safer than false precision.
