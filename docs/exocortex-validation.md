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
| Hosted runner CPU architecture | Captured `uname -m` from the actual job | Diagnostic only; architecture is reported, not enforced |
| Real GGUF load and generation | Test run with a pinned model artifact, checksum verification, and successful load/generate/unload report | UNPROVEN |
| Metal execution | Device/runtime telemetry proving Metal backend use and layer offload | UNPROVEN |
| Physical iPad Air 5 M1 performance and thermals | Report captured on that exact iPad | UNPROVEN |
| Swift Playgrounds package import | Successful import/build inside Swift Playgrounds on the iPad | BLOCKED by current app launch crash; not equivalent to CI |

## CI workflow scope

`.github/workflows/exocortex-swift.yml` runs on `macos-15`. The workflow reports Swift/Xcode versions and `uname -m`; it does not enforce a specific CPU architecture. The runner label alone does not prove its CPU architecture, so use the captured job output.

The workflow currently checks:
1. Root package manifest and DeviceProbe target build.
2. Portable core tests and Release build.
3. DeviceProbe module build.
4. Portable core build for iOS Simulator.
5. Native llama target Release build.
6. Native lifecycle/fail-closed tests.

These checks establish compilation and deterministic test behavior only. They do not establish model inference, output quality, Metal execution, or iPad behavior.

## Real-model smoke test: design requirements

A real-model smoke test is implemented in `.github/workflows/exocortex-gguf-smoke.yml` as a manual-only `workflow_dispatch` workflow. It requires the operator to set `confirm_model_download=true`; it is not part of ordinary pull-request CI. The candidate is `bartowski/Qwen2.5-0.5B-Instruct-GGUF`, file `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`, pinned to revision `21ef23001f314d0895bd8439b08157c2d4cd9bb7`, expected size `397808192` bytes, SHA-256 `6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653`. The workflow verifies both size and SHA-256 before invoking Swift. Its opt-in XCTest requests CPU-only execution (`gpuLayers = 0`), context 128, one repetition, and at most 8 generated tokens; it logs load/generation timings and sampled `phys_footprint`, then asserts that the model is unloaded. This validates only the hosted runner's CPU path, not iPad or Metal. The workflow was successfully dispatched against the feature-branch commit for run `45269936888`; that run verified the artifact and build but stopped at memory preflight before model load or generation. The PR remains draft/unmerged. Before changing the pinned artifact:
- Select a small, legally redistributable GGUF artifact from a stable, pinned revision.
- Pin and verify its SHA-256 before invoking llama.cpp.
- Keep model download and inference behind an explicit manual opt-in; never download a model on every PR run.
- Record runner OS, `uname -m`, Swift/Xcode versions, model hash, llama.swift version, requested GPU layers, actual backend/device logs, load result, generated token count, and timings.
- Fail clearly when architecture or backend capabilities do not meet the test's stated purpose.
- Do not call a macOS Metal run an iPad test; do not infer GPU execution from `gpuLayers = -1` alone.
- Keep the test bounded and avoid sustained stress workloads.

A successful smoke test would validate the native pipeline on that specific hosted runner. It would still not validate the iPad Air 5 M1.

## Memory-safety telemetry and failure classification

- iOS-family targets continue to use `os_proc_available_memory()` for the process-available budget.
- macOS uses `host_statistics64(HOST_VM_INFO64)` and estimates free/reclaimable memory as `(free_count + inactive_count) * vm_kernel_page_size`. Overflow, API failure, or an invalid result remains UNKNOWN; it is never treated as unlimited memory.
- `ExocortexError.memoryUnavailable` distinguishes an unknown/unavailable measurement from a measured value below the configured threshold (`memoryPressure`). Both block model loading; an unavailable reading also requests emergency unload during inference.
- This macOS estimate is host-level free + inactive memory, not an iOS-style per-process memory budget. It is appropriate for a hosted macOS smoke-test preflight, but it must not be described as equivalent to the iPadOS process limit.

The first manual run (`45269936888`) verified the pinned GGUF size and SHA-256, built the native package, and ran on an arm64 virtualized Apple M1 macOS runner. It stopped at the memory preflight before llama.cpp model loading or generation. Therefore no tokens/sec or successful inference were produced. The new telemetry path and error distinction are intended to address that preflight failure; they remain unvalidated until a subsequent run succeeds.

## iPad GGUF benchmark safeguards

The current DeviceProbe benchmark is bounded (default two repetitions, 512 context tokens, 128 generated tokens per pass) and checks memory/thermal headroom before and after model load. It runs CPU-only first and then requests GPU offload. The 20 ms physical-footprint sampling is approximate and can miss short spikes.

Do not run on a hot device or when iPadOS reports memory pressure. The benchmark is not a sustained stress test. Treat unknown thermal or memory readings as a reason to stop.

## Current decision

- Continue portable/native source work through GitHub and CI.
- Keep PR #136 open, draft, and unmerged. The manual smoke workflow cannot be dispatched until it is separately present on the default branch.
- Treat real-model inference as UNPROVEN until the manual workflow succeeds on its exact run; Metal, Playgrounds-import, and physical-iPad claims remain UNPROVEN until their specific evidence exists.
- No paid services, hosted model calls, or external inference are required by the current CI workflow.
