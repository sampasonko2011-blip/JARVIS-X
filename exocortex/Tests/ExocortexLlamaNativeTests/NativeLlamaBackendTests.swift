import XCTest
import ExocortexCore
@testable import ExocortexLlamaNative

final class NativeLlamaBackendTests: XCTestCase {
    func testBackendInitializesInUnloadedState() async {
        let backend = NativeLlamaCppBackend()
        XCTAssertFalse(await backend.isLoaded)
        await backend.unloadModel()
        XCTAssertFalse(await backend.isLoaded)
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
        XCTAssertFalse(await backend.isLoaded)
    }

    func testUnloadIsIdempotentWhenNoModelWasLoaded() async {
        let backend = NativeLlamaCppBackend()
        await backend.unloadModel()
        await backend.unloadModel()
        XCTAssertFalse(await backend.isLoaded)
    }
}
