# JARVIS-X Capability Fusion

JARVIS-X does not assign permanent jobs to models.

A model is an **organ**. A capability is an **attribute**. The router selects
the best evidence-backed organ for each micro-capability required by the task.

## Routing rule

TASK -> DECOMPOSE CAPABILITIES -> SCORE ORGANS -> FUSE -> VERIFY -> UPDATE EVIDENCE

Example:

- dribbling -> current best organ
- finishing -> current best organ
- goalkeeper scan -> current best organ

If the leaderboard changes, routing changes. "Claude = vision" or "GPT = finishing"
are hypotheses until benchmark evidence validates them.

## Evidence weighting

VALIDATED > OBSERVED > PROPOSED > UNPROVEN.

REJECTED and SUPERSEDED evidence cannot win a route.

This layer is deliberately independent of provider branding. New providers can be
added without changing the fusion algorithm.

## Current Claude status

Claude is connected/authenticated in the execution environment, but live inference
has not yet been successfully observed through the current Anthropic connector path.
Therefore no Claude capability score is treated as validated yet.

## Upgrade gate

A provider/capability claim becomes routing-grade only after a comparable benchmark:
same task family, same evaluation rubric, held-out/equivalent retest, and regression
check.