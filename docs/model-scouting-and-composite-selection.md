# Level 6: model scouting and composite selection

## Principle

JARVIS-X is the system; models and gateways are replaceable specialists. Select by measured performance on the actual workload, not by brand or a static catalog. Public code and documentation can teach engineering patterns, but they do not grant access to private weights, proprietary internals, or free hosted inference.

## Capability scouting

1. **Inspect public engineering methods.** Study public documentation, permissively licensed code, issue discussions, evaluations, and reproducible techniques. Respect license/terms; implement equivalent behavior cleanly rather than copying restricted code.
2. **Separate model, weights, gateway, and hosted API.** They are four different things. A gateway may route to many providers; that is not evidence that its routes are free or consistently available.
3. **Build a workload-specific shortlist.** Candidate families in `evaluation/model-candidates.json` are scouting leads, not a ranking. Exact checkpoints, licenses, context limits, hardware requirements, and availability must be checked for the intended deployment.
4. **Establish the baseline.** Use the existing fixed synthetic tasks. Add real but non-sensitive representative tasks only with permission. Keep the prompt, limits, and scoring rubric versioned.
5. **Run eligible candidates.** Record exact model/checkpoint, upstream route, date, request count, latency, failure/timeout rate, token/compute limits, and recurring price evidence. Exclude paid routes, finite trial credits, and unknown pricing from a strict zero-cost run.
6. **Score blindly.** Hide model identity from evaluators. Use a rubric for correctness, instruction compliance, evidence quality, code correctness, and unsafe/confident fabrication. Include adversarial/contradiction tasks.
7. **Retest before promotion.** Repeat on a holdout set or a comparable second run. Keep the model only if improvement exceeds noise and its latency, privacy, license, and reliability trade-offs are acceptable.
8. **Compose specialists.** Route coding, reasoning, critique, and synthesis to the candidates that actually win those tasks. Require independent verification for high-impact results; do not let multiple models agreeing count as proof.

## Zero-cost definition

“Free” means the exact route has recurring zero-price access under current terms, not a finite trial, promotional credits, an undocumented anonymous endpoint, or a free software license alone. Local inference has no per-request API fee but still consumes hardware, electricity, storage, and time. The provider adapter's `verified-zero-cost` setting is an operator assertion and is not a billing oracle.

## Claude and other proprietary systems

Claude Code is a useful source of public workflow ideas and documented tool-use practices. It is not correct to say that Claude's model is “open on the internet” in the sense of freely downloadable weights or unrestricted free inference. JARVIS-X can reproduce useful *capabilities* through independent implementations, public methods, tools, tests, and model routing; it cannot absorb proprietary model weights or guarantee identical intelligence by studying public pages.

## Definition of done for this milestone

- [ ] provider and gateway remain swappable
- [ ] strict zero-cost guard and safe failover pass deterministic tests
- [ ] exact route and recurring price are verified for any live free claim
- [ ] benchmark artifacts capture model identity, failures, latency, and rubric scores
- [ ] blind comparable retest establishes any claimed quality improvement
- [ ] CI passes on the exact PR head
- [ ] no secret, user-sensitive data, or paid fallback is used in the test

Until the live route and comparable benchmark gates pass, report the architecture as software-ready and the real-world composite quality as **UNPROVEN**.
