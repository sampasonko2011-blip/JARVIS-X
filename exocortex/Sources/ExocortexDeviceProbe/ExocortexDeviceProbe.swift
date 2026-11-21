import Foundation
import ExocortexCore
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

    private static func milliseconds(since start: UInt64) -> Double {
        Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000
    }
}
