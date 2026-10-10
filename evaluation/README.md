# Evaluation harness

This directory is reserved for reproducible evaluation tooling.

## Evidence status

- The existing runtime comparison uses deterministic local/mock providers; it is useful for regression checks but is not evidence of real-model quality.
- Real-provider comparisons must remain opt-in, explicitly budgeted, and secret-safe.
- Never commit API keys, raw authorization headers, private user data, or unredacted environment dumps.
- Compare baseline and composite runs on the same frozen tasks and rubric. Report correctness, constraint compliance, latency, cost, and failure rates separately.
- Blind scoring where practical; preserve sanitized provenance and task-set hashes; retest claimed improvements on a holdout set.
- Until a paired real-provider evaluation and holdout retest pass, claims that fusion improves real-world quality remain UNPROVEN.

See [the real-provider evaluation protocol](../docs/real-provider-evaluation.md) for the methodology and evidence gate.
