import Foundation
import ExocortexCore
import ExocortexLlamaNative
#if canImport(Metal)
import Metal
#endif
#if canImport(Accelerate)
import Accelerate
#endif
#if os(iOS) || os(tvOS) || os(watchOS)
import Darwin
#endif

public struct ExocortexProbeMeasurement: Sendable, Equatable {
    public let name: String
    public let value: String
    public let durationMilliseconds: Double?
    public let status: String
}
public struct ExocortexProbeReport: Sendable, Equatable {
    public let generatedAt: Date
    public let measurements: [ExocortexProbeMeasurement]
}

/// Call run() from a Swift Playgrounds App project on the physical iPad.
/// It deliberately performs a tiny deterministic probe, not a sustained stress test.
public enum ExocortexDeviceProbe {
    public static func run() async -> ExocortexProbeReport {
        var results: [ExocortexProbeMeasurement] = []
        #if canImport(Metal)
        if let device = MTLCreateSystemDefaultDevice() {
            results.append(.init(name: "Metal device", value: device.name, durationMilliseconds: nil, status: "available"))
            let bytes = 64 * 512 * MemoryLayout<Float>.stride
            let start = DispatchTime.now().uptimeNanoseconds
            let buffer = device.makeBuffer(length: bytes, options: .storageModeShared)
            let elapsed = milliseconds(since: start)
            results.append(.init(name: "Shared Metal buffer", value: buffer == nil ? "allocation failed" : "\(bytes) bytes allocated", durationMilliseconds: elapsed, status: buffer == nil ? "failed" : "passed"))
        } else {
            results.append(.init(name: "Metal device", value: "MTLCreateSystemDefaultDevice returned nil", durationMilliseconds: nil, status: "unavailable"))
            results.append(.init(name: "Shared Metal buffer", value: "not attempted", durationMilliseconds: nil, status: "skipped"))
        }
        #else
        results.append(.init(name: "Metal device", value: "Metal framework unavailable", durationMilliseconds: nil, status: "unsupported"))
        #endif

        let thermal = ProcessInfo.processInfo.thermalState
        results.append(.init(name: "Thermal state", value: String(describing: thermal), durationMilliseconds: nil, status: "observed"))
        #if os(iOS) || os(tvOS) || os(watchOS)
        let available = os_proc_available_memory()
        results.append(.init(name: "Available process memory", value: "\(available) bytes", durationMilliseconds: nil, status: "observed"))
        #else
        results.append(.init(name: "Available process memory", value: "iOS-only os_proc_available_memory probe", durationMilliseconds: nil, status: "not-applicable"))
        #endif

        let vectorA = (0..<512).map { Float($0) / 512 }
        let vectorB = (0..<512).map { Float(512 - $0) / 512 }
        #if canImport(Accelerate)
        var dot: Float = 0
        let vectorStart = DispatchTime.now().uptimeNanoseconds
        vectorA.withUnsafeBufferPointer { a in
            vectorB.withUnsafeBufferPointer { b in
                vDSP_dotpr(a.baseAddress!, 1, b.baseAddress!, 1, &dot, vDSP_Length(vectorA.count))
            }
        }
        results.append(.init(name: "vDSP dot product", value: "result=\(dot)", durationMilliseconds: milliseconds(since: vectorStart), status: "passed"))
        #else
        results.append(.init(name: "vDSP dot product", value: "Accelerate unavailable", durationMilliseconds: nil, status: "unsupported"))
        #endif

        let evidence = EvidenceRecord(propositionKey: "device.probe", value: "completed", source: .runtime, provenance: "ExocortexDeviceProbe")
        let claim = EvidenceClaim(propositionKey: "device.probe", value: "completed", supportingEvidenceIDs: [evidence.id])
        let context = CognitiveTurnContext(evidence: [evidence], claims: [claim])
        let saboteur = SaboteurAgent()
        let vector = Array(repeating: Float(0.25), count: 512)
        let start = DispatchTime.now().uptimeNanoseconds
        let structureOK = saboteur.validateStructure(output: vector, confidence: 0.95, expectedDimension: 512)
        let facts = saboteur.validateFacts(context: context, claims: [claim])
        let duration = milliseconds(since: start)
        let passed = structureOK && facts.mayPersist
        results.append(.init(name: "CognitiveTurnContext → SaboteurAgent", value: "structure=\(structureOK), evidence=\(facts.disposition.rawValue)", durationMilliseconds: duration, status: passed ? "passed" : "failed"))
        return ExocortexProbeReport(generatedAt: .now, measurements: results)
    }

public struct ExocortexLlamaComparisonReport: Sendable {
    public let modelURL: URL
    public let cpu: NativeLlamaBenchmarkReport?
    public let gpu: NativeLlamaBenchmarkReport?
    public let cpuError: String?
    public let gpuError: String?

    public var rendered: String {
        func section(_ label: String, _ report: NativeLlamaBenchmarkReport?, _ error: String?) -> String {
            guard let report else { return "\\(label): NOT RUN / FAILED — \\(error ?? "unknown error")" }
            let runs = report.runs.enumerated().map { index, run in
                "  run \\(index + 1): prefill=\\(String(format: "%.2f", run.prefillTokensPerSecond)) tok/s, decode=\\(String(format: "%.2f", run.decodeTokensPerSecond)) tok/s, total=\\(String(format: "%.2f", run.generationTokensPerSecond)) tok/s"
            }.joined(separator: "\\n")
            let peak = report.sampledPeakPhysicalFootprintBytes.map { String($0) + " bytes" } ?? "unavailable"
            let available = report.minimumAvailableBytesDuringRuns >= 0 ? "\\(report.minimumAvailableBytesDuringRuns) bytes" : "unknown"
            return """
            \\(label): PASS
              quantization=\\(report.model.quantization), file=\\(report.model.fileBytes) bytes, tensor=\\(report.model.tensorBytes) bytes
              gpuLayersRequested=\\(report.model.gpuLayersRequested), load=\\(String(format: "%.2f", report.model.loadMilliseconds)) ms
              sampledPeakPhysFootprint=\\(peak), minimumAvailableDuringRuns=\\(available)
              thermal(before/after-load/after-runs)=\\(report.beforeLoad.thermalState)/\\(report.afterLoad.thermalState)/\\(report.afterRuns.thermalState)
            \\(runs)
            """
        }
        return """
        EXOCORTEX Q4_K_M CPU → GPU comparison
        model=\\(modelURL.lastPathComponent)
        \\(section("CPU (gpuLayers=0)", cpu, cpuError))
        \\(section("GPU request (gpuLayers=-1)", gpu, gpuError))
        NOTE: gpuLayers=-1 is an offload request, not proof that GPU kernels were used. Confirm native llama.cpp backend logs/device telemetry. phys_footprint peak is sampled every 20 ms and may miss brief spikes.
        """
    }
}

/// One-call, sequential CPU then GPU benchmark for a local Q4_K_M GGUF.
/// Each pass owns a fresh backend/context; generate() clears KV memory before every run.
/// This performs real model loading/inference and should only be run on a physical device.
public extension ExocortexDeviceProbe {
    static func runLlamaBenchmark(
        modelURL: URL,
        prompt: String = "Explain in one short paragraph why evidence provenance matters.",
        contextTokens: Int = 512,
        maximumTokens: Int = 128,
        repetitions: Int = 2,
        minimumAvailableMemoryBytes: Int64 = 2_684_354_560
    ) async -> ExocortexLlamaComparisonReport {
        var cpuReport: NativeLlamaBenchmarkReport?
        var gpuReport: NativeLlamaBenchmarkReport?
        var cpuError: String?
        var gpuError: String?

        do {
            let backend = NativeLlamaCppBackend()
            cpuReport = try await backend.benchmark(
                at: modelURL, contextTokens: contextTokens, prompt: prompt,
                maximumTokens: maximumTokens, repetitions: repetitions,
                gpuLayers: 0, minimumAvailableMemoryBytes: minimumAvailableMemoryBytes,
                requireQ4KM: true
            )
        } catch {
            cpuError = String(describing: error)
        }

        // CPU pass unloads its model before returning. The second pass independently
        // re-checks available memory and thermal state before requesting GPU offload.
        do {
            let backend = NativeLlamaCppBackend()
            gpuReport = try await backend.benchmark(
                at: modelURL, contextTokens: contextTokens, prompt: prompt,
                maximumTokens: maximumTokens, repetitions: repetitions,
                gpuLayers: -1, minimumAvailableMemoryBytes: minimumAvailableMemoryBytes,
                requireQ4KM: true
            )
        } catch {
            gpuError = String(describing: error)
        }

        let report = ExocortexLlamaComparisonReport(
            modelURL: modelURL, cpu: cpuReport, gpu: gpuReport,
            cpuError: cpuError, gpuError: gpuError
        )
        print(report.rendered)
        return report
    }
}

    private static func milliseconds(since start: UInt64) -> Double {
        Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
    }
}
