# Level 6 expanded model shortlist — evidence and selection rules

This document records the expanded candidate set in `evaluation/model-candidates.json`. It is a **scouting queue, not a leaderboard**.

## Role-based showdown

| Role | Candidates to compare | Decision rule |
|---|---|---|
| Coding / repository edits | Qwen3-Coder-Next, Qwen3-Coder-30B-A3B-Instruct, Devstral family | Issue-to-patch tests, build/test pass rate, regressions, review findings |
| Reasoning / critique | DeepSeek-R1 exact checkpoint, GLM family, current ChatGPT session as human-run baseline | Ground-truth correctness, calibrated uncertainty, contradiction handling |
| Agentic tool use | GLM family, Kimi K2 family, Devstral family | Tool-call validity, recovery after failure, task completion without unsafe actions |
| Synthesis / instruction following | Current ChatGPT session, Qwen candidate, DeepSeek candidate | Coverage, constraint adherence, evidence traceability, concise correctness |
| Private / offline fallback | Ollama plus a named local checkpoint | Reproducibility, privacy, latency, hardware cost |

**No candidate is the winner until it is actually run on the same fixed tasks and a comparable holdout retest.** The current ChatGPT session is not automatically callable from the repository as an API; record it as a manually evaluated baseline unless a supported endpoint is explicitly configured.

## Candidate scouting notes

- **Qwen3-Coder-Next**: official model card lists Apache-2.0 and documents local serving options. Model-card benchmark figures are vendor-provided context, not a substitute for our workload test. Source: https://huggingface.co/Qwen/Qwen3-Coder-Next
- **DeepSeek-R1**: official release states the model weights are MIT licensed, while distilled variants inherit additional upstream licensing considerations. Exact checkpoint still matters. Source: https://github.com/deepseek-ai/DeepSeek-R1
- **Qwen3-Coder-30B-A3B-Instruct, Kimi K2, GLM-4.5, Devstral, Gemma**: keep as candidates pending exact release, license, runtime, and hardware verification. Never generalize a family-level license across all variants.
- **Claude Code public workflows**: learn from public docs and patterns; do not treat these as Claude model weights or free inference.
- **Ollama** is a runtime, not a model. **FreeLLMpool** is a gateway, not a model; each upstream route needs its own identity, price, and reliability verification.
- **ChatGPT / “6 Astra”**: use the current ChatGPT session as a manually evaluated baseline. Do not claim the repo can call this session independently unless an actual supported API route is configured.

## Fair showdown protocol

1. Freeze a versioned, non-sensitive task set: code repair, test writing, code review, multi-step reasoning, contradiction detection, synthesis, and tool-failure recovery.
2. Capture exact model/checkpoint, runtime/version, prompt, decoding parameters, route identity, date, latency, token/compute use, errors, and recurring price evidence.
3. Hide candidate identities from scorers. Score correctness, instruction compliance, regression rate, evidence quality, uncertainty calibration, safety, and task completion.
4. Repeat on a holdout or comparable second run. Report variance; do not select based on one lucky response or vendor leaderboard.
5. Use specialist routing only when measured gains justify added latency, complexity, and privacy exposure. Require independent tests for code and independent evidence for factual claims.
6. Zero-cost eligibility means recurring zero-price for the exact route under current terms. Trial credits, paid fallbacks, unknown pricing, and a free software license alone do not qualify.

## Evidence ledger

- **OBSERVED**: the repository shortlist now names additional candidate models and role assignments.
- **OBSERVED**: official Qwen3-Coder-Next model card identifies an Apache-2.0 license; official DeepSeek-R1 repository describes MIT licensing for the released model weights. Exact variant terms still need review.
- **PROPOSED**: role-specific showdown task matrix above.
- **UNPROVEN**: which model wins each role, live zero-cost access, live FreeLLMpool availability, actual local hardware fit, and any composite quality improvement.
- **NOT DONE**: no model weights have been installed or merged into JARVIS-X by adding these metadata records.
