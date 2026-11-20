import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
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


private struct FixedContextualEngine: ContextualReasoningEngine {
    let result: ReasoningResult
    func reason(input: [Float], cycleBudget: Int) async throws -> ReasoningResult { result }
    func reason(context: CognitiveTurnContext, cycleBudget: Int) async throws -> ReasoningResult { result }
}

private actor ContextCaptureEngine: ContextualReasoningEngine {
    let result: ReasoningResult
    private var captured: CognitiveTurnContext?
    init(result: ReasoningResult) { self.result = result }
    func reason(input: [Float], cycleBudget: Int) async throws -> ReasoningResult { result }
    func reason(context: CognitiveTurnContext, cycleBudget: Int) async throws -> ReasoningResult {
        captured = context
        return result
    }
    func capturedContext() -> CognitiveTurnContext? { captured }
}

private actor MemoryWriteSpy: DurableMemoryStore {
    private(set) var writes = 0
    func recall(_ query: String, consent: Bool, userAccessToken: String) async throws -> MemoryRecall {
        guard consent else { throw ExocortexError.memoryConsentRequired }
        return MemoryRecall(status: "empty", context: "")
    }
    func remember(_ content: String, consent: Bool, userAccessToken: String) async throws -> MemoryReceipt {
        guard consent else { throw ExocortexError.memoryConsentRequired }
        writes += 1
        return MemoryReceipt(status: "stored", receipt: "test")
    }
    func writeCount() -> Int { writes }
}

final class ExocortexCoreTests: XCTestCase {
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


    func testEvidenceLedgerRejectsContradictionsAndMarksUnknown() {
        let fact = EvidenceRecord(propositionKey: "device.chip", value: "M1", source: .xmemo, provenance: "xmemo://memory/42", score: 0.98)
        let context = CognitiveTurnContext(memoryRecall: MemoryRecall(status: "recalled", context: "Chip: M1"), memoryEvidence: [fact])
        let contradiction = SaboteurAgent().validateFacts(context: context, claims: [
            EvidenceClaim(propositionKey: "device.chip", value: "M2")
        ])
        XCTAssertEqual(contradiction.disposition, .rejected)
        XCTAssertEqual(contradiction.contradictions, ["device.chip"])
        XCTAssertFalse(contradiction.mayPersist)
        let unknown = SaboteurAgent().validateFacts(context: context, claims: [
            EvidenceClaim(propositionKey: "device.ram", value: "16 GB")
        ])
        XCTAssertEqual(unknown.unknownClaims, ["device.ram"])
        XCTAssertFalse(unknown.mayPersist)
    }

    func testEvidenceLedgerAcceptsOnlySupportedClaim() {
        let fact = EvidenceRecord(propositionKey: "device.chip", value: "M1", source: .xmemo, provenance: "xmemo://memory/42", score: 0.98)
        let context = CognitiveTurnContext(memoryEvidence: [fact])
        let claim = EvidenceClaim(propositionKey: "device.chip", value: "M1", supportingEvidenceIDs: [fact.id])
        let result = SaboteurAgent().validateFacts(context: context, claims: [claim])
        XCTAssertEqual(result.disposition, .accepted)
        XCTAssertTrue(result.mayPersist)
    }

    func testXMemoRecallBuildsAuthenticatedContractRequest() async throws {
        let transport = StubMemoryTransport(responseBody: Data(#"{"status":"recalled","context":"Chip: M1"}"#.utf8))
        let memory = try XMemoMemoryStore(gatewayURL: URL(string: "https://example.test/functions/v1/hq-gateway-v12")!, anonKey: "publishable", transport: transport)
        let result = try await memory.recall("What chip?", consent: true, userAccessToken: "user-session")
        XCTAssertEqual(result.status, "recalled")
        XCTAssertEqual(result.context, "Chip: M1")
        let request = await transport.request()
        XCTAssertEqual(request?.httpMethod, "POST")
        XCTAssertEqual(request?.url?.absoluteString, "https://example.test/functions/v1/hq-gateway-v12/memory/xmemo/recall")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "apikey"), "publishable")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer user-session")
        let body = try XCTUnwrap(request?.httpBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["consent"] as? Bool, true)
        XCTAssertEqual(json["query"] as? String, "What chip?")
    }


    func testXMemoRememberBuildsAuthenticatedContractRequest() async throws {
        let transport = StubMemoryTransport(responseBody: Data(#"{"status":"stored","receipt":"receipt-123"}"#.utf8))
        let memory = try XMemoMemoryStore(gatewayURL: URL(string: "https://example.test/functions/v1/hq-gateway-v12/")!, anonKey: "publishable", transport: transport)
        let result = try await memory.remember("approved note", consent: true, userAccessToken: "user-session")
        XCTAssertEqual(result.status, "stored")
        XCTAssertEqual(result.receipt, "receipt-123")
        let request = await transport.request()
        XCTAssertEqual(request?.url?.absoluteString, "https://example.test/functions/v1/hq-gateway-v12/memory/xmemo/remember")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer user-session")
        let body = try XCTUnwrap(request?.httpBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["consent"] as? Bool, true)
        XCTAssertEqual(json["content"] as? String, "approved note")
    }

    func testXMemoRejectsRememberWithoutConsentBeforeTransport() async throws {
        let transport = StubMemoryTransport(responseBody: Data(#"{"status":"stored"}"#.utf8))
        let memory = try XMemoMemoryStore(gatewayURL: URL(string: "https://example.test/gateway/")!, anonKey: "publishable", transport: transport)
        do {
            _ = try await memory.remember("private note", consent: false, userAccessToken: "session")
            XCTFail("Expected consent gate")
        } catch { XCTAssertEqual(error as? ExocortexError, .memoryConsentRequired) }
        let capturedRequest = await transport.request()
        XCTAssertNil(capturedRequest)
    }

    func testXMemoMapsHTTPFailureAndOfflineTransport() async throws {
        let failedHTTP = StubMemoryTransport(statusCode: 503, responseBody: Data())
        let memory = try XMemoMemoryStore(gatewayURL: URL(string: "https://example.test/gateway/")!, anonKey: "publishable", transport: failedHTTP)
        do {
            _ = try await memory.recall("query", consent: true, userAccessToken: "session")
            XCTFail("Expected HTTP error")
        } catch { XCTAssertEqual(error as? ExocortexError, .httpStatus(503)) }
        let offline = StubMemoryTransport(responseBody: Data(), shouldFail: true)
        let offlineMemory = try XMemoMemoryStore(gatewayURL: URL(string: "https://example.test/gateway/")!, anonKey: "publishable", transport: offline)
        do {
            _ = try await offlineMemory.recall("query", consent: true, userAccessToken: "session")
            XCTFail("Expected offline transport error")
        } catch { XCTAssertTrue(error is URLError) }
    }


    func testOrchestratorCollectsXMemoWorkingSetAndExecutedToolEvidenceAndRequiresWriteConsent() async throws {
        let memory = MemoryWriteSpy()
        let workingSet = EphemeralWorkingSet(ttl: 172_800)
        let workingFact = EvidenceRecord(
            propositionKey: "session.goal",
            value: "learn swift",
            source: .workingSet,
            provenance: "working-set://entry/goal"
        )
        try await workingSet.storeEvidence(workingFact)

        let toolRegistry = ToolRegistry(allowedNames: ["calendar.lookup"])
        let toolRequest = ToolRequest(name: "calendar.lookup", payload: Data("today".utf8))
        let toolFact = try await toolRegistry.recordExecutedResult(
            toolRequest,
            result: ToolExecutionResult(
                propositionKey: "calendar.today",
                value: "free",
                provenance: "tool://calendar.lookup/result/1"
            )
        )
        XCTAssertEqual(toolFact.source, .tool)

        let xmemoFact = EvidenceRecord(
            propositionKey: "profile.preference",
            value: "concise",
            source: .xmemo,
            provenance: "xmemo://memory/42",
            score: 0.97
        )
        let recall = MemoryRecall(status: "recalled", context: "User prefers concise explanations")
        let context = CognitiveTurnContext(memoryRecall: recall, memoryEvidence: [xmemoFact])
        let engine = ContextCaptureEngine(result: ReasoningResult(
            output: [1],
            confidence: 0.99,
            claims: [EvidenceClaim(
                propositionKey: "session.goal",
                value: "learn swift",
                supportingEvidenceIDs: [workingFact.id]
            )]
        ))
        let orchestrator = ExocortexOrchestrator(
            engine: engine,
            memoryStore: memory,
            workingSet: workingSet,
            toolRegistry: toolRegistry
        )

        let decision = try await orchestrator.think(
            seed: [0],
            context: context,
            budget: ThermalGuardian.budget(for: .nominal)
        )
        XCTAssertTrue(decision.approved)
        let captured = await engine.capturedContext()
        let evidence = try XCTUnwrap(captured).allEvidence
        XCTAssertTrue(evidence.contains { $0.source == .xmemo && $0.provenance == "xmemo://memory/42" })
        XCTAssertTrue(evidence.contains { $0.source == .workingSet && $0.id == workingFact.id })
        XCTAssertTrue(evidence.contains { $0.source == .tool && $0.id == toolFact.id })
        XCTAssertTrue(evidence.contains { $0.propositionKey == "xmemo.recall.context" })

        do {
            _ = try await orchestrator.rememberValidated(
                "approved turn",
                decision: decision,
                consent: false,
                userAccessToken: "user-session"
            )
            XCTFail("XMemo persistence must require separate explicit consent")
        } catch {
            XCTAssertEqual(error as? ExocortexError, .memoryConsentRequired)
        }
        let writes = await memory.writeCount()
        XCTAssertEqual(writes, 0)
    }

    func testOrchestratorBlocksContradictionAndNeverPersistsIt() async throws {
        let memory = MemoryWriteSpy()
        let fact = EvidenceRecord(propositionKey: "device.chip", value: "M1", source: .xmemo, provenance: "xmemo://memory/42")
        let context = CognitiveTurnContext(memoryEvidence: [fact])
        let engine = FixedContextualEngine(result: ReasoningResult(output: [1], confidence: 0.99, claims: [
            EvidenceClaim(propositionKey: "device.chip", value: "M2")
        ]))
        let orchestrator = ExocortexOrchestrator(engine: engine, memoryStore: memory)
        let decision = try await orchestrator.think(seed: [0], context: context, budget: ThermalGuardian.budget(for: .nominal))
        XCTAssertFalse(decision.approved)
        XCTAssertEqual(decision.reason, "factual_contradiction_detected")
        do {
            _ = try await orchestrator.rememberValidated("turn", decision: decision, consent: true, userAccessToken: "session")
            XCTFail("Contradictory result must not be persisted")
        } catch { XCTAssertEqual(error as? ExocortexError, .validationRejected) }
        let writes = await memory.writeCount()
        XCTAssertEqual(writes, 0)
    }

    func testOrchestratorRequiresSeparateMemoryConsentAfterValidation() async throws {
        let memory = MemoryWriteSpy()
        let engine = FixedContextualEngine(result: ReasoningResult(output: [1], confidence: 0.99))
        let orchestrator = ExocortexOrchestrator(engine: engine, memoryStore: memory)
        let decision = try await orchestrator.think(seed: [0], context: CognitiveTurnContext(), budget: ThermalGuardian.budget(for: .nominal))
        XCTAssertTrue(decision.approved)
        do {
            _ = try await orchestrator.rememberValidated("turn", decision: decision, consent: false, userAccessToken: "session")
            XCTFail("Separate persistence consent must be required")
        } catch { XCTAssertEqual(error as? ExocortexError, .memoryConsentRequired) }
        let writes = await memory.writeCount()
        XCTAssertEqual(writes, 0)
    }


    func testAutomaticEvidenceCollectionBlocksXMemoWriteWithoutSeparateConsent() async throws {
        let memory = MemoryWriteSpy()
        let workingSet = EphemeralWorkingSet()
        let workingFact = EvidenceRecord(
            propositionKey: "device.ram",
            value: "8 GB",
            source: .workingSet,
            provenance: "working-set://entry/ram",
            observedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        try await workingSet.storeEvidence(workingFact)
        let journal = EphemeralToolEvidenceJournal()
        let registry = ToolRegistry(allowedNames: ["inspect"], journal: journal)
        let request = ToolRequest(name: "inspect", payload: Data("{}".utf8))
        let toolFact = try await registry.recordExecutedResult(
            request,
            result: ToolExecutionResult(
                propositionKey: "device.os",
                value: "iPadOS",
                provenance: "tool://inspect/run-7",
                completedAt: Date(timeIntervalSince1970: 1_700_000_001)
            )
        )
        XCTAssertEqual(toolFact.source, .tool)
        let xmemoFact = EvidenceRecord(
            propositionKey: "device.chip",
            value: "M1",
            source: .xmemo,
            provenance: "xmemo://memory/42",
            observedAt: Date(timeIntervalSince1970: 1_700_000_002)
        )
        let context = CognitiveTurnContext(
            memoryRecall: MemoryRecall(status: "recalled", context: "Chip M1"),
            memoryEvidence: [xmemoFact]
        )
        let engine = FixedContextualEngine(result: ReasoningResult(
            output: [1],
            confidence: 0.99,
            claims: [
                EvidenceClaim(propositionKey: "device.ram", value: "8 GB", supportingEvidenceIDs: [workingFact.id]),
                EvidenceClaim(propositionKey: "device.os", value: "iPadOS", supportingEvidenceIDs: [toolFact.id]),
                EvidenceClaim(propositionKey: "device.chip", value: "M1", supportingEvidenceIDs: [xmemoFact.id])
            ]
        ))
        let orchestrator = ExocortexOrchestrator(
            engine: engine,
            memoryStore: memory,
            workingSet: workingSet,
            toolRegistry: registry
        )
        let decision = try await orchestrator.think(
            seed: [0],
            context: context,
            budget: ThermalGuardian.budget(for: .nominal)
        )
        XCTAssertTrue(decision.approved)
        do {
            _ = try await orchestrator.rememberValidated(
                "validated turn",
                decision: decision,
                consent: false,
                userAccessToken: "session"
            )
            XCTFail("XMemo write must require separate explicit consent")
        } catch { XCTAssertEqual(error as? ExocortexError, .memoryConsentRequired) }
        let writes = await memory.writeCount()
        XCTAssertEqual(writes, 0)
    }

    func testVoiceFeaturesAreAcousticOnly() throws {
        let features = try VoiceBiometricMonitor.analyze([1, -1, 1, -1])
        XCTAssertEqual(features.rms, 1, accuracy: 0.0001)
        XCTAssertEqual(features.peak, 1, accuracy: 0.0001)
        XCTAssertGreaterThan(features.zeroCrossingRate, 0)
    }
}
