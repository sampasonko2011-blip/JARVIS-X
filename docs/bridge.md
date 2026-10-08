# JX-ORG-BRIDGE-001 — Native Session Bridge

Approved implementation of the Frenemy-inspired bridge architecture.

## Organism mapping
- Claude native session = reasoning/critique organ.
- Frenemy-style relay = nervous-system bridge.
- JARVIS-X router = executive control.
- Verification/ledger = immune system and outcome memory.

## Safety boundary
Default mode is read-only. Write mode is disabled unless explicitly enabled by JARVIS-X policy.
The bridge enforces prompt/output caps, timeouts, round limits, and output sanitization.

## Capability truth states
AVAILABLE → INVOKED → EXECUTED → CORRECT → COMPLETED → WORLD-STATE VERIFIED.

Installing an adapter does not prove Claude executed. Real execution requires the Claude CLI to be installed, authenticated, reachable, and successfully invoked.

## Benchmark governance
The bridge benchmark validates routing/policy mechanics only. It is not intelligence evidence.
The real comparison is GPT-only vs GPT+Claude on the same held-out tasks, followed by a comparable retest and regression/cost check.

## Design principle
The bridge is abstracted behind NativeSessionProvider so future native-session organs can use the same JARVIS-X control plane.