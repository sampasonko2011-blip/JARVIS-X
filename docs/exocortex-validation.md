# EXOCORTEX Swift validation matrix

## Current branch contract

- Repository: `sampasonko2011-blip/JARVIS-X`
- Working branch: `feat/exocortex-swift-core-xmemo`
- Pull request: #136 — must remain open, draft, and unmerged until separately authorized.
- Root Swift package products: `ExocortexCore`, `ExocortexLlamaNative`, `ExocortexDeviceProbe`.
- Native dependency: `llama.swift` pinned to exact version `3.0.0`.

## Evidence levels

| Capability | Evidence required | Current status |
|---|---|---|
| Root package resolves/builds on hosted macOS | Successful `swift build` in CI on the exact commit | CI baseline was green at `b2543a865ffb96351519a3e4e3098f560dd2ff7c`; subsequent workflow/documentation commits require fresh CI |
| Portable core tests | Successful `swift test --filter ExocortexCoreTests` | Same baseline qualification |
| Portable core iOS Simulator build | Successful `xcodebuild` for generic iOS Simulator | Same baseline qualification |
| Native llama adapter compiles | Successful native target build on hosted macOS | Same baseline qualification |
| Native lifecycle/fail-closed tests | Successful `swift test --filter NativeLlamaBackendTests` | Same baseline qualification; tests do not load a real model |
| Hosted runner CPU architecture | Captured `uname -m` from the actual job | Newly added diagnostic; do not assume `macos-15` means Apple Silicon |
| Real GGUF load and generation | Test run with a pinned model artifact, checksum verification, and successful load/generate/unload report | UNPROVEN |
| Metal execution | Device/runtime telemetry proving Metal backend use and layer offload | UNPROVEN |
| Physical iPad Air 5 M1 performance and thermals | Report captured on that exact iPad | UNPROVEN |
| Swift Playgrounds package import | Successful import/build inside Swift Playgrounds on the iPad | BLOCKED by current app launch crash; not equivalent to CI |

## CI workflow scope

`.github/workflows/exocortex-swift.yml` runs on `macos-15`. The workflow reports Swift/Xcode versions and `uname -m`. The runner label alone does not prove its CPU architecture; use the captured job output.

The workflow currently checks:
1. Root package manifest and DeviceProbe target build.
2. Portable core tests and Release build.
3. DeviceProbe module build.
4. Portable core build for iOS Simulator.
5. Native llama target Release build.
6. Native lifecycle/fail-closed tests.

These checks establish compilation and deterministic test behavior only. They do not establish model inference, output quality, Metal execution, or iPad behavior.

## Real-model smoke test: design requirements

A real-model CI smoke test is a separate, opt-in capability and is not part of ordinary pull-request CI yet. Before adding it:
- Select a small, legally redistributable GGUF artifact from a stable, pinned revision.
- Pin and verify its SHA-256 before invoking llama.cpp.
- Keep model download and inference behind an explicit manual opt-in; never download a model on every PR run.
- Record runner OS, `uname -m`, Swift/Xcode versions, model hash, llama.swift version, requested GPU layers, actual backend/device logs, load result, generated token count, and timings.
- Fail clearly when architecture or backend capabilities do not meet the test's stated purpose.
- Do not call a macOS Metal run an iPad test; do not infer GPU execution from `gpuLayers = -1` alone.
- Keep the test bounded and avoid sustained stress workloads.

A successful smoke test would validate the native pipeline on that specific hosted runner. It would still not validate the iPad Air 5 M1.

## iPad GGUF benchmark safeguards

The current DeviceProbe benchmark is bounded (default two repetitions, 512 context tokens, 128 generated tokens per pass) and checks memory/thermal headroom before and after model load. It runs CPU-only first and then requests GPU offload. The 20 ms physical-footprint sampling is approximate and can miss short spikes.

Do not run on a hot device or when iPadOS reports memory pressure. The benchmark is not a sustained stress test. Treat unknown thermal or memory readings as a reason to stop.

## Current decision

- Continue portable/native source work through GitHub and CI.
- Keep PR #136 open, draft, and unmerged.
- Treat all real-model, Metal, Playgrounds-import, and physical-iPad claims as UNPROVEN until their specific evidence exists.
- No paid services, hosted model calls, or external inference are required by the current CI workflow.
