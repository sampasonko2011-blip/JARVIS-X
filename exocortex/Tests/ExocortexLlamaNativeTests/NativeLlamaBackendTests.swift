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

}
