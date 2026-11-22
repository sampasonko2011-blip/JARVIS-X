import Foundation
import LlamaSwift
import ExocortexCore


public struct NativeLlamaMemorySnapshot: Sendable, Equatable {
    public let availableBytes: Int64
    public let physicalFootprintBytes: UInt64?
    public let thermalState: ThermalCondition
}
public struct NativeLlamaModelMetadata: Sendable, Equatable {
    public let fileBytes: UInt64
    public let tensorBytes: UInt64
    public let parameterCount: UInt64
    public let layerCount: Int32
    public let fileTypeCode: Int32
    public let loadMilliseconds: Double
    public var quantization: String { fileTypeCode == 15 ? "Q4_K_M" : "llama_ftype_code_\\(fileTypeCode)" }
    public var isQ4KM: Bool { fileTypeCode == 15 }
}
public struct NativeLlamaGenerationMetrics: Sendable, Equatable {
    public let promptTokenCount: Int
    public let generatedTokenCount: Int
    public let prefillMilliseconds: Double
    public let decodeMilliseconds: Double
    public var prefillTokensPerSecond: Double { prefillMilliseconds > 0 ? Double(promptTokenCount) * 1_000 / prefillMilliseconds : 0 }
    public var decodeTokensPerSecond: Double { decodeMilliseconds > 0 ? Double(generatedTokenCount) * 1_000 / decodeMilliseconds : 0 }
}
public struct NativeLlamaBenchmarkReport: Sendable, Equatable {
    public let model: NativeLlamaModelMetadata
    public let beforeLoad: NativeLlamaMemorySnapshot
    public let afterLoad: NativeLlamaMemorySnapshot
    public let afterRuns: NativeLlamaMemorySnapshot
    public let runs: [NativeLlamaGenerationMetrics]
}

/// Real llama.cpp implementation backed by the official llama.swift 3.0.0 XCFramework.
/// Actor isolation serializes every access to llama.cpp's model/context/batch state.
public actor NativeLlamaCppBackend: LlamaCppBackend {
    private var model: OpaquePointer?
    private var context: OpaquePointer?
    private var backendInitialized = false
    private var loadedMetadata: NativeLlamaModelMetadata?
    public private(set) var lastGenerationMetrics: NativeLlamaGenerationMetrics?

    public init() {}

    public var isLoaded: Bool { model != nil && context != nil }

    public func loadModel(at url: URL, contextTokens: Int) async throws {
        try await loadModel(at: url, contextTokens: contextTokens, gpuLayers: -1,
                            minimumAvailableMemoryBytes: 2_684_354_560)
    }

    /// gpuLayers 0 is CPU-only; -1 requests offload of all eligible layers.
    /// Actual device offload must be confirmed from llama.cpp logs/device telemetry.
    public func loadModel(
        at url: URL,
        contextTokens: Int,
        gpuLayers: Int32,
        minimumAvailableMemoryBytes: Int64 = 2_684_354_560
    ) async throws {
        if isLoaded { await unloadModel() }
        guard url.isFileURL, url.pathExtension.lowercased() == "gguf",
              FileManager.default.isReadableFile(atPath: url.path),
              (128...4096).contains(contextTokens) else {
            throw ExocortexError.modelNotLoaded
        }
        let handle: FileHandle
        do { handle = try FileHandle(forReadingFrom: url) }
        catch { throw ExocortexError.modelNotLoaded }
        let header = try handle.read(upToCount: 4) ?? Data()
        try? handle.close()
        guard header == Data("GGUF".utf8) else { throw ExocortexError.modelNotLoaded }
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        let fileBytes = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
        guard fileBytes > 0 else { throw ExocortexError.modelNotLoaded }

        let before = Self.memorySnapshot()
        guard before.thermalState == .nominal || before.thermalState == .fair,
              before.availableBytes >= minimumAvailableMemoryBytes else {
            throw before.thermalState == .serious || before.thermalState == .critical ||
                before.thermalState == .unknown
                ? ExocortexError.thermalLimit : ExocortexError.memoryPressure
        }

        let start = ProcessInfo.processInfo.systemUptime
        llama_backend_init()
        backendInitialized = true
        var params = llama_model_default_params()
        params.n_gpu_layers = gpuLayers
        let loadedModel: OpaquePointer? = url.path.withCString { llama_model_load_from_file($0, params) }
        guard let loadedModel else {
            await unloadModel()
            throw ExocortexError.modelNotLoaded
        }
        var contextParams = llama_context_default_params()
        contextParams.n_ctx = UInt32(contextTokens)
        contextParams.n_batch = UInt32(min(512, contextTokens))
        contextParams.n_ubatch = UInt32(min(512, contextTokens))
        guard let loadedContext = llama_init_from_model(loadedModel, contextParams) else {
            llama_model_free(loadedModel)
            await unloadModel()
            throw ExocortexError.runtimeUnavailable
        }
        model = loadedModel
        context = loadedContext
        loadedMetadata = NativeLlamaModelMetadata(
            fileBytes: fileBytes,
            tensorBytes: llama_model_size(loadedModel),
            parameterCount: llama_model_n_params(loadedModel),
            layerCount: llama_model_n_layer(loadedModel),
            fileTypeCode: Int32(llama_model_ftype(loadedModel).rawValue),
            loadMilliseconds: max(0, (ProcessInfo.processInfo.systemUptime - start) * 1_000)
        )
        let after = Self.memorySnapshot()
        guard after.thermalState == .nominal || after.thermalState == .fair,
              after.availableBytes >= minimumAvailableMemoryBytes else {
            await unloadModel()
            throw after.thermalState == .serious || after.thermalState == .critical ||
                after.thermalState == .unknown
                ? ExocortexError.thermalLimit : ExocortexError.memoryPressure
        }
    }

    public func generate(
        prompt: String,
        maximumTokens: Int,
        shouldAbort: @escaping @Sendable () -> Bool
    ) async throws -> String {
        guard let model, let context else { throw ExocortexError.modelNotLoaded }
        guard !prompt.isEmpty, maximumTokens > 0 else { throw ExocortexError.invalidPayload }

        lastGenerationMetrics = nil
        guard !shouldAbort() else { throw ExocortexError.thermalLimit }
        llama_memory_clear(llama_get_memory(context), true)
        let vocab = llama_model_get_vocab(model)
        let utf8Count = Int32(prompt.utf8.count)
        var tokens = [llama_token](repeating: 0, count: Int(utf8Count) + 2)
        var tokenCount: Int32 = 0
        for _ in 0..<2 {
            tokenCount = llama_tokenize(
                vocab, prompt, utf8Count, &tokens, Int32(tokens.count), true, true
            )
            guard tokenCount < 0, tokenCount != Int32.min else { break }
            tokens = [llama_token](repeating: 0, count: Int(-tokenCount))
        }
        guard tokenCount > 0 else { throw ExocortexError.invalidPayload }
        let promptTokens = Array(tokens.prefix(Int(tokenCount)))
        let contextCapacity = Int(llama_n_ctx(context))
        guard promptTokens.count <= 512, promptTokens.count < contextCapacity,
              maximumTokens <= contextCapacity - promptTokens.count else {
            throw ExocortexError.invalidPayload
        }

        var batch = llama_batch_init(512, 0, 1)
        defer { llama_batch_free(batch) }
        batch.n_tokens = Int32(promptTokens.count)
        for index in promptTokens.indices {
            batch.token[index] = promptTokens[index]
            batch.pos[index] = Int32(index)
            batch.n_seq_id[index] = 1
            if let sequenceIDs = batch.seq_id,
               let sequence = sequenceIDs[index] {
                sequence[0] = 0
            }
            batch.logits[index] = 0
        }
        batch.logits[Int(batch.n_tokens) - 1] = 1
        let prefillStart = ProcessInfo.processInfo.systemUptime
        guard llama_decode(context, batch) == 0 else {
            throw ExocortexError.runtimeUnavailable
        }
        let prefillMilliseconds = max(0.000_001, (ProcessInfo.processInfo.systemUptime - prefillStart) * 1_000)

        var generatedBytes: [UInt8] = []
        var currentPosition = batch.n_tokens
        var generatedTokenCount = 0
        let decodeStart = ProcessInfo.processInfo.systemUptime
        for generationIndex in 0..<maximumTokens {
            if shouldAbort() { throw ExocortexError.thermalLimit }
            guard let logits = llama_get_logits_ith(context, batch.n_tokens - 1) else {
                throw ExocortexError.runtimeUnavailable
            }
            let vocabularySize = Int(llama_vocab_n_tokens(vocab))
            guard vocabularySize > 0 else { throw ExocortexError.runtimeUnavailable }
            var bestToken: llama_token = 0
            var bestLogit = logits[0]
            if vocabularySize > 1 {
                for index in 1..<vocabularySize where logits[index] > bestLogit {
                    bestLogit = logits[index]
                    bestToken = llama_token(index)
                }
            }
            if llama_vocab_is_eog(vocab, bestToken) { break }

            var piece = [CChar](repeating: 0, count: 64)
            var pieceLength = llama_token_to_piece(
                vocab, bestToken, &piece, Int32(piece.count), 0, false
            )
            if pieceLength < 0 {
                piece = [CChar](repeating: 0, count: Int(-pieceLength))
                pieceLength = llama_token_to_piece(
                    vocab, bestToken, &piece, Int32(piece.count), 0, false
                )
            }
            if pieceLength > 0 {
                generatedBytes.append(contentsOf: piece.prefix(Int(pieceLength)).map {
                    UInt8(bitPattern: $0)
                })
            }
            generatedTokenCount += 1
            if generationIndex + 1 < maximumTokens {
                batch.n_tokens = 1
                batch.token[0] = bestToken
                batch.pos[0] = currentPosition
                batch.n_seq_id[0] = 1
                if let sequenceIDs = batch.seq_id, let sequence = sequenceIDs[0] {
                    sequence[0] = 0
                }
                batch.logits[0] = 1
                currentPosition += 1
                guard llama_decode(context, batch) == 0 else {
                    throw ExocortexError.runtimeUnavailable
                }
            }
        }
        let decodeMilliseconds = max(0, (ProcessInfo.processInfo.systemUptime - decodeStart) * 1_000)
        lastGenerationMetrics = NativeLlamaGenerationMetrics(
            promptTokenCount: promptTokens.count,
            generatedTokenCount: generatedTokenCount,
            prefillMilliseconds: prefillMilliseconds,
            decodeMilliseconds: decodeMilliseconds
        )
        return String(decoding: generatedBytes, as: UTF8.self)
    }

    /// Bounded local benchmark: no network and no XMemo access.
    /// Memory values are snapshots, not a sampled peak-RSS measurement.
    public func benchmark(
        at url: URL,
        contextTokens: Int = 512,
        prompt: String,
        maximumTokens: Int = 128,
        repetitions: Int = 3,
        gpuLayers: Int32 = -1,
        minimumAvailableMemoryBytes: Int64 = 2_684_354_560,
        requireQ4KM: Bool = true
    ) async throws -> NativeLlamaBenchmarkReport {
        guard (1...3).contains(repetitions), maximumTokens > 0 else {
            throw ExocortexError.invalidPayload
        }
        let before = Self.memorySnapshot()
        try await loadModel(at: url, contextTokens: contextTokens, gpuLayers: gpuLayers,
                            minimumAvailableMemoryBytes: minimumAvailableMemoryBytes)
        guard let metadata = loadedMetadata else {
            await unloadModel()
            throw ExocortexError.runtimeUnavailable
        }
        guard !requireQ4KM || metadata.isQ4KM else {
            await unloadModel()
            throw ExocortexError.invalidPayload
        }
        let afterLoad = Self.memorySnapshot()
        do {
            var runs: [NativeLlamaGenerationMetrics] = []
            for _ in 0..<repetitions {
                _ = try await generate(prompt: prompt, maximumTokens: maximumTokens) {
                    let state = Self.memorySnapshot()
                    return state.thermalState == .serious || state.thermalState == .critical ||
                        state.thermalState == .unknown ||
                        (state.availableBytes >= 0 && state.availableBytes < minimumAvailableMemoryBytes)
                }
                guard let metrics = lastGenerationMetrics else {
                    throw ExocortexError.runtimeUnavailable
                }
                runs.append(metrics)
            }
            let report = NativeLlamaBenchmarkReport(
                model: metadata,
                beforeLoad: before,
                afterLoad: afterLoad,
                afterRuns: Self.memorySnapshot(),
                runs: runs
            )
            await unloadModel()
            return report
        } catch {
            await unloadModel()
            throw error
        }
    }

    private static func memorySnapshot() -> NativeLlamaMemorySnapshot {
        let safety = SystemRuntimeSafetyMonitor().snapshot()
        #if canImport(Darwin)
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(
            MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size
        )
        let result = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        let footprint: UInt64? = result == KERN_SUCCESS ? info.phys_footprint : nil
        #else
        let footprint: UInt64? = nil
        #endif
        return NativeLlamaMemorySnapshot(
            availableBytes: safety.availableMemoryBytes,
            physicalFootprintBytes: footprint,
            thermalState: safety.thermalCondition
        )
    }

    public func unloadModel() async {
        if let context {
            llama_free(context)
            self.context = nil
        }
        if let model {
            llama_model_free(model)
            self.model = nil
        }
        if backendInitialized {
            llama_backend_free()
            backendInitialized = false
        }
        loadedMetadata = nil
        lastGenerationMetrics = nil
    }

    deinit {
        // Explicit unload is required before releasing the actor; avoid calling
        // nonisolated C teardown from deinit where actor isolation is unavailable.
    }
}
