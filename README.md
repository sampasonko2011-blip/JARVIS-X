# JARVIS-X

Human × AI Performance Operating System.

> Models are organs. JARVIS-X is the organism.

JARVIS-X composes reasoning, coding, research, memory, verification, and execution capabilities into an adaptive system. It treats models and tools as interchangeable organs rather than as the architecture itself.

## Principles

- Truth > agreement
- Evidence > confidence
- Outcome > output
- Verification > assumption
- Capability > brand
- Composition > competition

## Architecture

See `docs/architecture.md` and `docs/self-audit.md`.

## Benchmarks

See [docs/benchmarking.md](docs/benchmarking.md) for reproducible runtime benchmark instructions, CI artifact details, and the distinction between deterministic fixture checks and real model-quality evaluation.

See [docs/live-provider-adapters.md](docs/live-provider-adapters.md) for credential-gated hosted adapters and the optional local Ollama route. Ollama uses an explicitly registered, locally installed model and defaults to `http://127.0.0.1:11434`; it does not require an API key. Adapter availability is not the same as a validated model; hosted calls require authorized credentials, current model IDs, and separate quality evaluation. Local inference avoids per-request hosted fees but requires suitable hardware, disk, memory, and electricity. OpenRouter remains excluded by policy.
