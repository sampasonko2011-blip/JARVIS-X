import Foundation
import LlamaSwift
import ExocortexCore

/// Real llama.cpp implementation backed by the official llama.swift 3.0.0 XCFramework.
/// Actor isolation serializes every access to llama.cpp's model/context/batch state.
public actor NativeLlamaCppBackend: LlamaCppBackend {
    private var model: OpaquePointer?
    private var context: OpaquePointer?
    private var backendInitialized = false

    public init() {}

    public var isLoaded: Bool { model != nil && context != nil }

    public func loadModel(at url: URL, contextTokens: Int) async throws {
        if isLoaded { await unloadModel() }
        guard url.isFileURL,
              url.pathExtension.lowercased() == "gguf",
              FileManager.default.isReadableFile(atPath: url.path) else {
            throw ExocortexError.modelNotLoaded
        }
        let handle: FileHandle
        do { handle = try FileHandle(forReadingFrom: url) }
        catch { throw ExocortexError.modelNotLoaded }
        let header = try handle.read(upToCount: 4) ?? Data()
        try? handle.close()
        guard header == Data("GGUF".utf8) else { throw ExocortexError.modelNotLoaded }

        llama_backend_init()
        backendInitialized = true
        let params = llama_model_default_params()
        let loadedModel: OpaquePointer? = url.path.withCString {
            llama_model_load_from_file($0, params)
        }
        guard let loadedModel else {
            await unloadModel()
            throw ExocortexError.modelNotLoaded
        }

        var contextParams = llama_context_default_params()
        contextParams.n_ctx = UInt32(max(128, contextTokens))
        contextParams.n_batch = UInt32(min(512, max(128, contextTokens)))
        guard let loadedContext = llama_init_from_model(loadedModel, contextParams) else {
            llama_model_free(loadedModel)
            await unloadModel()
            throw ExocortexError.runtimeUnavailable
        }
        model = loadedModel
        context = loadedContext
    }

    public func generate(
        prompt: String,
        maximumTokens: Int,
        shouldAbort: @escaping @Sendable () -> Bool
    ) async throws -> String {
        guard let model, let context else { throw ExocortexError.modelNotLoaded }
        guard !prompt.isEmpty, maximumTokens > 0 else { throw ExocortexError.invalidPayload }

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
        guard promptTokens.count <= 512 else { throw ExocortexError.invalidPayload }

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
        guard llama_decode(context, batch) == 0 else {
            throw ExocortexError.runtimeUnavailable
        }

        var generatedBytes: [UInt8] = []
        var currentPosition = batch.n_tokens
        for _ in 0..<maximumTokens {
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
        return String(decoding: generatedBytes, as: UTF8.self)
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
    }

    deinit {
        // Explicit unload is required before releasing the actor; avoid calling
        // nonisolated C teardown from deinit where actor isolation is unavailable.
    }
}
