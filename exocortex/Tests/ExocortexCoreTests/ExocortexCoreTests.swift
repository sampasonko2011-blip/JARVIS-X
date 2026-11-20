import XCTest
@testable import ExocortexCore


private actor StubMemoryTransport: MemoryHTTPTransport {
    private let statusCode: Int
    private let responseBody: Data
    private let shouldFail: Bool
    private var storedRequest: URLRequest?
    init(statusCode: Int = 200, responseBody: Data, shouldFail: Bool = false) {
        self.statusCode = statusCode
        self.responseBody = responseBody
        self.shouldFail = shouldFail
    }
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        storedRequest = request
        if shouldFail { throw URLError(.notConnectedToInternet) }
        let response = HTTPURLResponse(url: request.url!, statusCode: statusCode, httpVersion: nil, headerFields: nil)!
        return (responseBody, response)
    }
    func request() -> URLRequest? { storedRequest }
}
\nfinal class ExocortexCoreTests: XCTestCase {
    func testBusCapacityAndValidation() async throws {
        let bus = try NeuralBus(dimension: 1, capacity: 1)
        try await bus.publish(VectorMessage(source: "a", values: [1]))
        try await bus.publish(VectorMessage(source: "b", values: [2]))
        let latest = await bus.latest()
        XCTAssertEqual(latest.count, 1)
        XCTAssertEqual(latest[0].source, "b")
        do {
            try await bus.publish(VectorMessage(source: "x", values: [.nan]))
            XCTFail("Expected non-finite vector rejection")
        } catch { XCTAssertEqual(error as? ExocortexError, .invalidVector) }
    }

    func testThermalBudgets() {
        XCTAssertGreaterThan(ThermalGuardian.budget(for: .nominal).reasoningCycles, ThermalGuardian.budget(for: .critical).reasoningCycles)
    }

    func testXMemoConsentAndValidation() async throws {
        let memory = try XMemoMemoryStore(gatewayURL: URL(string: "https://example.test/functions/v1/hq-gateway-v12/")!, anonKey: "anon")
        do {
            _ = try await memory.recall("query", consent: false, userAccessToken: "token")
            XCTFail("Expected explicit consent")
        } catch { XCTAssertEqual(error as? ExocortexError, .memoryConsentRequired) }
        do {
            _ = try await memory.recall(" ", consent: true, userAccessToken: "token")
            XCTFail("Expected blank query rejection")
        } catch { XCTAssertEqual(error as? ExocortexError, .invalidPayload) }
    }

    func testWorkingSetRecallExpiryAndClear() async throws {
        let memory = EphemeralWorkingSet(ttl: 1)
        _ = try await memory.store([1, 0], now: Date(timeIntervalSince1970: 0))
        let found = try await memory.nearest(to: [1, 0], now: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(found, [1, 0])
        let expired = await memory.count(now: Date(timeIntervalSince1970: 2))
        XCTAssertEqual(expired, 0)
        _ = try await memory.store([0, 1])
        await memory.clear()
        let cleared = await memory.count()
        XCTAssertEqual(cleared, 0)
    }

    func testSaboteurRequiresCalibratedConfidence() {
        let saboteur = SaboteurAgent()
        XCTAssertFalse(saboteur.validate(output: [0], confidence: nil))
        XCTAssertFalse(saboteur.validate(output: [0], confidence: 0.69))
        XCTAssertTrue(saboteur.validate(output: [0], confidence: 0.70))
        XCTAssertFalse(saboteur.validate(output: [.nan], confidence: 0.99))
    }

    func testPayloadBounds() {
        XCTAssertTrue(AntiUltronShield.accepts(payload: Data([1]), maximumBytes: 1))
        XCTAssertFalse(AntiUltronShield.accepts(payload: Data([1, 2]), maximumBytes: 1))
    }

    func testEvolutionUsesHeldOutScoreAndRejectsNaN() {
        let arena = EvolutionArena()
        let winner = arena.champion(from: [CandidateScore(candidateID: "a", heldOutScore: 0.8), CandidateScore(candidateID: "b", heldOutScore: 0.9)], minimumScore: 0.85)
        XCTAssertEqual(winner?.candidateID, "b")
        XCTAssertNil(arena.champion(from: [CandidateScore(candidateID: "bad", heldOutScore: .nan)], minimumScore: 0))
    }

    func testToolAllowlistAndPayloadSize() throws {
        let registry = ToolRegistry(allowedNames: ["summarize"], maximumPayloadBytes: 1)
        XCTAssertNoThrow(try registry.validate(ToolRequest(name: "summarize", payload: Data([1]))))
        XCTAssertThrowsError(try registry.validate(ToolRequest(name: "shell", payload: Data())))
        XCTAssertThrowsError(try registry.validate(ToolRequest(name: "summarize", payload: Data([1, 2]))))
    }

    func testSensorConsent() async throws {
        struct Recognizer: LocalTextRecognizer {
            func recognizeText(from imageData: Data) async throws -> String { "ok" }
        }
        let reader = ScreenVisionReader(recognizer: Recognizer())
        do {
            _ = try await reader.extractText(from: Data([1]), consent: SensorConsent())
            XCTFail("Expected consent gate")
        } catch { XCTAssertEqual(error as? ExocortexError, .memoryConsentRequired) }
    }

    func testPeerTrustRequiresEncryption() {
        let policy = SwarmPeerPolicy(trustedPeerIDs: ["peer"])
        XCTAssertTrue(policy.accepts(peerID: "peer", encryptedTransport: true))
        XCTAssertFalse(policy.accepts(peerID: "peer", encryptedTransport: false))
        XCTAssertFalse(policy.accepts(peerID: "unknown", encryptedTransport: true))
    }

    func testWhisperRequiresOptIn() {
        let policy = MetabolicWhisperPolicy()
        XCTAssertFalse(policy.shouldWhisper(confidence: 0.99, userEnabled: false))
        XCTAssertTrue(policy.shouldWhisper(confidence: 0.99, userEnabled: true))
    }

    func testHypervectorOperations() throws {
        let oracle = HyperdimensionalOracle(bitCount: 128)
        let vector: [UInt64] = [0, 1]
        XCTAssertEqual(try oracle.similarity(vector, vector), 1)
        XCTAssertThrowsError(try oracle.bind([1], [1]))
    }

    func testMaximin() throws {
        let result = try GameTheoryStrategist().maximin([[3, 1], [2, 2]])
        XCTAssertEqual(result.row, 1)
        XCTAssertEqual(result.guaranteedGain, 2)
    }

    func testVoiceFeaturesAreAcousticOnly() throws {
        let features = try VoiceBiometricMonitor.analyze([1, -1, 1, -1])
        XCTAssertEqual(features.rms, 1, accuracy: 0.0001)
        XCTAssertEqual(features.peak, 1, accuracy: 0.0001)
        XCTAssertGreaterThan(features.zeroCrossingRate, 0)
    }
}
