# Artifact Bridge v1

JARVIS-X needs a transport capability when a builder can produce a verified Git artifact but cannot reach the repository remote.

Flow: PACKAGE -> INTEGRITY VALIDATE -> PROVENANCE VALIDATE -> IMPORT PLAN -> REMOTE IMPORT -> REMOTE VERIFY -> RETEST.

Safety invariants:
- main is never an implicit import target.
- force-push is never authorized by the import plan.
- invalid provenance blocks import planning.
- an exact remote SHA is a NOOP.
- artifact integrity and Git provenance are separate checks.

v1 is deliberately protocol-level. Runtime adapters can connect the protocol to GitHub, GitLab, local Git, or another repository surface. It does not silently execute shell commands or claim remote state from a local artifact.
