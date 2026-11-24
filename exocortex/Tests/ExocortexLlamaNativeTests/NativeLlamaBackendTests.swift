import XCTest
import ExocortexCore
@testable import ExocortexLlamaNative

final class NativeLlamaBackendTests: XCTestCase {
    func testBackendInitializesInUnloadedState() async {
        let backend = NativeLlamaCppBackend()
        let initiallyLoaded = await backend.isLoaded
        XCTAssertFalse(initiallyLoaded)
        await backend.unloadModel()
        let loadedAfterUnload = await backend.isLoaded
        XCTAssertFalse(loadedAfterUnload)
    }

    func testMissingGGUFFailsClosed() async {
        let backend = NativeLlamaCppBackend()
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("gguf")
        do {
            try await backend.loadModel(at: missing, contextTokens: 256)
            XCTFail("A missing model must not initialize llama.cpp")
        } catch {
            XCTAssertEqual(error as? ExocortexError, .modelNotLoaded)
        }
        let loaded = await backend.isLoaded
        XCTAssertFalse(loaded)
    }

    func testUnloadIsIdempotentWhenNoModelWasLoaded() async {
        let backend = NativeLlamaCppBackend()
        await backend.unloadModel()
        await backend.unloadModel()
        let loaded = await backend.isLoaded
        XCTAssertFalse(loaded)
    }

    func testBenchmarkRejectsMissingGGUFFailClosed() async {
        let backend = NativeLlamaCppBackend()
        let missing = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("gguf")
        do {
            _ = try await backend.benchmark(
                at: missing,
                prompt: "A short deterministic benchmark prompt.",
                maximumTokens: 8,
                repetitions: 1
            )
            XCTFail("A missing model must fail before benchmark execution")
        } catch {
            XCTAssertEqual(error as? ExocortexError, .modelNotLoaded)
        }
        let loaded = await backend.isLoaded
        XCTAssertFalse(loaded)
    }


    /// Runs only from the explicit manual GGUF workflow after an external SHA-256 check.
    func testManualGGUFCPUInferenceSmoke() async throws {
        guard ProcessInfo.processInfo.environment["EXOCORTEX_GGUF_SMOKE"] == "1" else {
            throw XCTSkip("Real-model inference is opt-in; use the manual workflow_dispatch workflow.")
        }
        guard let modelPath = ProcessInfo.processInfo.environment["EXOCORTEX_GGUF_PATH"],
              !modelPath.isEmpty else {
            XCTFail("EXOCORTEX_GGUF_PATH must point to the checksum-verified model.")
            return
        }

        let modelURL = URL(fileURLWithPath: modelPath)
        let backend = NativeLlamaCppBackend()
        let report = try await backend.benchmark(
            at: modelURL,
            contextTokens: 128,
            prompt: "State one reason evidence provenance matters.",
            maximumTokens: 8,
            repetitions: 1,
            gpuLayers: 0,
            minimumAvailableMemoryBytes: 2_684_354_560,
            requireQ4KM: true
        )

        XCTAssertEqual(report.model.fileBytes, 397_808_192)
        XCTAssertEqual(report.model.quantization, "Q4_K_M")
        XCTAssertEqual(report.model.gpuLayersRequested, 0)
        XCTAssertEqual(report.runs.count, 1)
        let metrics = try XCTUnwrap(report.runs.first)
        XCTAssertGreaterThan(metrics.generatedTokenCount, 0)
        XCTAssertLessThanOrEqual(metrics.generatedTokenCount, 8)

        let peak = report.sampledPeakPhysicalFootprintBytes.map { String($0) } ?? "unknown"
        print(
            "GGUF_SMOKE_RESULT model=Qwen2.5-0.5B-Instruct-Q4_K_M " +
            "file_bytes=\(report.model.fileBytes) params=\(report.model.parameterCount) " +
            "layers=\(report.model.layerCount) quantization=\(report.model.quantization) " +
            "gpu_layers_requested=0 load_ms=\(report.model.loadMilliseconds) " +
            "generated_tokens=\(metrics.generatedTokenCount) " +
            "prefill_ms=\(metrics.prefillMilliseconds) decode_ms=\(metrics.decodeMilliseconds) " +
            "generation_ms=\(metrics.generationMilliseconds) " +
            "sampled_peak_phys_footprint_bytes=\(peak) " +
            "minimum_available_bytes=\(report.minimumAvailableBytesDuringRuns) " +
            "thermal=\(report.beforeLoad.thermalState)/\(report.afterLoad.thermalState)/\(report.afterRuns.thermalState)"
        )
        let stillLoaded = await backend.isLoaded
        XCTAssertFalse(stillLoaded, "Benchmark must unload the model after the run.")
    }

}
