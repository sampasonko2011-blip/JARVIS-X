# EXOCORTEX Swift validation matrix

## Current branch contract

- Repository: `sampasonko2011-blip/JARVIS-X`
- Default branch: `main` at `c6e10592744c934044535122ccccf89bf58bfac2` as observed at the start of this audit.
- PR #136 was merged into `main`; it is not open or draft.
- Current hardening work is isolated on `feat/jarvisx-p0-hardening-spatial-hud`; it must not be merged or deployed without separate approval.
- Root Swift package products: `ExocortexCore`, `ExocortexLlamaNative`, `ExocortexDeviceProbe`.
- Native dependency: `llama.swift` pinned to exact version `3.0.0`.

## Evidence levels

| Capability | Evidence required | Current status |
|---|---|---|
| Root package resolves/builds on hosted macOS | Successful `swift build` in CI on the exact commit | CI baseline was green at `b2543a865ffb96351519a3e4e3098f560dd2ff7c`; subsequent workflow/documentation commits require fresh CI |
| Portable core tests | Successful `swift test --filter ExocortexCoreTests` on exact candidate SHA | VALIDATED on `c7e46f19ffbdc7d7df371236feab76aa18dccdff`: 41/41 tests passed, including runtime cleanup and XMemo proof-binding regressions |
| Portable core iOS Simulator build | Successful `xcodebuild` for generic iOS Simulator | Same baseline qualification |
| Native llama adapter compiles | Successful native target build on hosted macOS | Same baseline qualification |
| Native lifecycle/fail-closed tests | Successful `swift test --filter NativeLlamaBackendTests` on exact candidate SHA | VALIDATED on `c7e46f19ffbdc7d7df371236feab76aa18dccdff`: 5 tests passed; opt-in GGUF test skipped in ordinary CI |
| Hosted runner CPU architecture | Captured `uname -m` from the actual job | Diagnostic only; architecture is reported, not enforced |
| Real GGUF load and generation | Test run with a pinned model artifact, checksum verification, and successful load/generate/unload report | VALIDATED on hosted virtual M1 CPU (run 45356577656); not iPad/Metal |
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

A real-model smoke test is implemented in `.github/workflows/exocortex-gguf-smoke.yml` as a manual-only `workflow_dispatch` workflow. It requires the operator to set `confirm_model_download=true`; it is not part of ordinary pull-request CI. The candidate is `bartowski/Qwen2.5-0.5B-Instruct-GGUF`, file `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf`, pinned to revision `21ef23001f314d0895bd8439b08157c2d4cd9bb7`, expected size `397808192` bytes, SHA-256 `6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653`. The workflow verifies both size and SHA-256 before invoking Swift. Its opt-in XCTest requests CPU-only execution (`gpuLayers = 0`), context 128, one repetition, and at most 8 generated tokens; it logs load/generation timings and sampled `phys_footprint`, then asserts that the model is unloaded. This validates only the hosted runner's CPU path, not iPad or Metal. Run `45269936888` verified the artifact and build but stopped at memory preflight before model load or generation. A later run (`45356577656`) completed the bounded CPU load/generate/unload smoke test; see the run-3 evidence section below. PR #136 was later merged into main; this historical smoke result is independent of the current hardening branch. Before changing the pinned artifact:
- Select a small, legally redistributable GGUF artifact from a stable, pinned revision.
- Pin and verify its SHA-256 before invoking llama.cpp.
- Keep model download and inference behind an explicit manual opt-in; never download a model on every PR run.
- Record runner OS, `uname -m`, Swift/Xcode versions, model hash, llama.swift version, requested GPU layers, actual backend/device logs, load result, generated token count, and timings.
- Fail clearly when architecture or backend capabilities do not meet the test's stated purpose.
- Do not call a macOS Metal run an iPad test; do not infer GPU execution from `gpuLayers = -1` alone.
- Keep the test bounded and avoid sustained stress workloads.

The successful smoke test validates the native CPU pipeline on that specific hosted runner only. It does not validate the iPad Air 5 M1.

## Memory-safety telemetry and failure classification

- iOS-family targets continue to use `os_proc_available_memory()` for the process-available budget.
- macOS uses `host_statistics64(HOST_VM_INFO64)` and estimates free/reclaimable memory as `(free_count + inactive_count) * getpagesize()`. The page size is obtained through the POSIX `getpagesize()` API rather than reading the mutable `vm_kernel_page_size` global. Overflow, API failure, or an invalid result remains UNKNOWN; it is never treated as unlimited memory.
- `ExocortexError.memoryUnavailable` distinguishes an unknown/unavailable measurement from a measured value below the configured threshold (`memoryPressure`). Both block model loading; an unavailable reading also requests emergency unload during inference.
- This macOS estimate is host-level free + inactive memory, not an iOS-style per-process memory budget. It is appropriate for a hosted macOS smoke-test preflight, but it must not be described as equivalent to the iPadOS process limit.

The first manual run (`45269936888`) verified the pinned GGUF size and SHA-256 and built the native package, but stopped at memory preflight before model loading or generation. This was an unsuccessful historical attempt, superseded by the successful bounded CPU smoke test `45356577656` documented below. The successful run validates only that hosted runner's CPU path.

## iPad GGUF benchmark safeguards

The current DeviceProbe benchmark is bounded (default two repetitions, 512 context tokens, 128 generated tokens per pass) and checks memory/thermal headroom before and after model load. It runs CPU-only first and then requests GPU offload. The 20 ms physical-footprint sampling is approximate and can miss short spikes.

Do not run on a hot device or when iPadOS reports memory pressure. The benchmark is not a sustained stress test. Treat unknown thermal or memory readings as a reason to stop.

## Current decision

- Continue portable/native source work through GitHub and CI.
- PR #136 is merged into main. Keep the current hardening branch unmerged and do not deploy it without separate approval.
- Real-model CPU inference is VALIDATED only for the bounded hosted virtual-M1 run 45356577656. Metal execution, Swift Playgrounds import, and physical-iPad behavior remain UNPROVEN until their specific evidence exists.
- No paid services, hosted model calls, or external inference are required by the current CI workflow.


## Successful hosted CPU GGUF smoke test — run 3

Run 45356577656 completed successfully on commit 80f0de177490fb4e24573be0d5c60a5738cc672b (2026-11-24).

- Runner: macOS 15.8.2, virtualized Apple M1, uname -m=arm64, 7 GB reported memory.
- Toolchain: Swift 6.1.2, Xcode 16.4; llama.swift 3.0.0.
- Model: Qwen2.5-0.5B-Instruct Q4_K_M; 397,808,192 bytes; SHA-256 6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653 verified.
- Result: actual GGUF load, 8 generated tokens, successful unload; the opt-in XCTest passed.
- Backend: CPU-only, gpu_layers_requested=0; native logs report 0/25 layers offloaded to GPU. Metal initialization messages are not evidence of Metal inference.
- Load: 22,346 ms. Prefill: 1,383 ms. Decode: 9,323 ms. Generation: 9,332 ms.
- Decode throughput: approximately 0.751 tokens/s using the backend's definition of 7 decode steps / decode time; end-to-end generation throughput: approximately 0.857 tokens/s (8 generated tokens / total generation time). Prompt token count was not included in the emitted result line, so prefill tokens/s cannot be reconstructed from this log.
- Sampled peak phys_footprint: 290,589,952 bytes (277.13 MiB), sampled every 20 ms; approximate and not a guaranteed peak.
- Minimum available memory reported: 3,164,520,448 bytes (approximately 2.947 GiB).
- Thermal state: nominal before and after.

This is VALIDATED evidence for one short CPU inference on that virtualized macOS runner only. It is not a measurement of the user's iPad Air 5, not evidence of iPad free RAM, not a Metal performance result, and not evidence for 12-agent concurrency. The suggested 20–40x Metal speedup remains UNPROVEN and must not be presented as a benchmark result.

The historical run `45355431744` initially had a cancelled Core job. Its rerun exposed two runtime-unload regressions (`testLlamaRuntimeThermalLimitTriggersUnload` and `testLlamaRuntimeUnavailableMemoryHasDistinctFailure`); both were subsequently fixed on the EXOCORTEX feature branch. The exact follow-up Core + Native run `45369925842` on `c7e46f19ffbdc7d7df371236feab76aa18dccdff` passed 41 Core tests and 5 Native tests. That evidence is separate from the P0 branch's JavaScript/TypeScript CI.


## 2026-11-24 status correction

PR #136 is merged. The earlier statement that it must remain open/draft/unmerged is obsolete and superseded.

The exact candidate commit `c7e46f19ffbdc7d7df371236feab76aa18dccdff` has successful Core, Native, and Verify CI checks (3/3). The Core run executed 41 tests, including the previously failing runtime-unload assertions and XMemo exact-content proof tests. The Native run executed five tests; the manual real-GGUF smoke test was skipped by its opt-in gate. The separate manual run `45356577656` remains evidence only for one short CPU inference on a virtualized hosted M1 runner.

This document is a historical validation record. It does not certify physical iPad, Metal inference, Swift Playgrounds import, live XMemo OAuth, or current production deployment behavior.
