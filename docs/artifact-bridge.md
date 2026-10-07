# Artifact Bridge v1

JARVIS-X treats artifact transport as a capability, not an implicit side effect.

Flow: PACKAGE -> INTEGRITY -> PROVENANCE -> IMPORT PLAN -> EXPLICIT REMOTE ACTION.

The manifest must validate before an import plan is created. Existing remote state produces NOOP or UPDATE_BRANCH; new state produces CREATE_BRANCH. Force-push is never enabled by the planner.

Verification is mandatory: transport success is configuration/state evidence only. Behavioral verification must still rebuild, test, and benchmark the canonical repository.
