import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import ExocortexCore


#if os(macOS)
final class SystemPageSizeTests: XCTestCase {
    func testSystemPageSizeUsesPositivePOSIXValue() {
        let pageSize = exocortexSystemPageSizeBytes()
        XCTAssertNotNil(pageSize)
        XCTAssertGreaterThan(pageSize ?? 0, 0)
    }
}
#endif

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


private struct StubLocalRuntime: LocalModelRuntime {
    let response: String?
    let failure: ExocortexError?
    func load(_ descriptor: LocalModelDescriptor) async throws {}
    func infer(prompt: String, cycleBudget: Int) async throws -> String {
        if let failure { throw failure }
        return response ?? ""
    }
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


private struct FixedRuntimeSafetyMonitor: RuntimeSafetyMonitoring {
    let state: RuntimeSafetySnapshot
    func snapshot() -> RuntimeSafetySnapshot { state }
}

private actor LlamaBackendSpy: LlamaCppBackend {
    private var loadCount = 0
    private var unloadCount = 0
    private var generateCount = 0
    func loadModel(at url: URL, contextTokens: Int) async throws { loadCount += 1 }
    func generate(prompt: String, maximumTokens: Int, shouldAbort: @escaping @Sendable () -> Bool) async throws -> String {
        generateCount += 1
        if shouldAbort() { throw ExocortexError.thermalLimit }
        return "local response"
    }
    func unloadModel() async { unloadCount += 1 }
    func counts() -> (Int, Int, Int) { (loadCount, unloadCount, generateCount) }
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

    func testXMemoPersistenceProofBindsExactValidatedCandidate() async throws {
        let memory = MemoryWriteSpy()
        let fact = EvidenceRecord(
            propositionKey: "profile.preference",
            value: "concise",
            source: .xmemo,
            provenance: "xmemo://profile/preference"
        )
        let claim = EvidenceClaim(
            propositionKey: "profile.preference",
            value: "concise",
            supportingEvidenceIDs: [fact.id]
        )
        let candidate = try XCTUnwrap(SaboteurAgent.canonicalMemoryCandidate(from: [claim]))
        let engine = FixedContextualEngine(result: ReasoningResult(
            output: [1],
            confidence: 0.99,
            claims: [claim],
            memoryCandidate: candidate
        ))
        let orchestrator = ExocortexOrchestrator(engine: engine, memoryStore: memory)
        let decision = try await orchestrator.think(
            seed: [0],
            context: CognitiveTurnContext(memoryEvidence: [fact]),
            budget: ThermalGuardian.budget(for: .nominal)
        )
        XCTAssertTrue(decision.approved)
        XCTAssertTrue(decision.memoryCandidateValidation?.mayPersist == true)
        XCTAssertNotNil(decision.memoryProof)
        do {
            _ = try await orchestrator.rememberValidated(
                candidate + " appended unverified text",
                decision: decision,
                consent: true,
                userAccessToken: "session"
            )
            XCTFail("A decision proof must not authorize altered content")
        } catch { XCTAssertEqual(error as? ExocortexError, .validationRejected) }
        let writesAfterMismatch = await memory.writeCount()
        XCTAssertEqual(writesAfterMismatch, 0)

        _ = try await orchestrator.rememberValidated(
            candidate,
            decision: decision,
            consent: true,
            userAccessToken: "session"
        )
        let writesAfterMatch = await memory.writeCount()
        XCTAssertEqual(writesAfterMatch, 1)
    }

    func testXMemoCandidateWithUnsupportedClaimCannotBeSealed() async throws {
        let memory = MemoryWriteSpy()
        let unsupported = EvidenceClaim(
            propositionKey: "profile.secret",
            value: "unsupported assertion",
            supportingEvidenceIDs: []
        )
        let candidate = try XCTUnwrap(SaboteurAgent.canonicalMemoryCandidate(from: [unsupported]))
        let engine = FixedContextualEngine(result: ReasoningResult(
            output: [1],
            confidence: 0.99,
            claims: [unsupported],
            memoryCandidate: candidate
        ))
        let orchestrator = ExocortexOrchestrator(engine: engine, memoryStore: memory)
        let decision = try await orchestrator.think(
            seed: [0],
            context: CognitiveTurnContext(),
            budget: ThermalGuardian.budget(for: .nominal)
        )
        XCTAssertFalse(decision.approved)
        XCTAssertFalse(decision.memoryCandidateValidation?.mayPersist == true)
        XCTAssertNil(decision.memoryProof)
        do {
            _ = try await orchestrator.rememberValidated(
                candidate,
                decision: decision,
                consent: true,
                userAccessToken: "session"
            )
            XCTFail("Unsupported claims must never be persisted")
        } catch { XCTAssertEqual(error as? ExocortexError, .validationRejected) }
        let writes = await memory.writeCount()
        XCTAssertEqual(writes, 0)
    }

    func testCanonicalMemoryCandidateNormalizesEvidenceIDOrder() throws {
        let first = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let second = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
        let forward = EvidenceClaim(
            propositionKey: "profile.preference",
            value: "concise",
            supportingEvidenceIDs: [first, second]
        )
        let reversed = EvidenceClaim(
            propositionKey: "profile.preference",
            value: "concise",
            supportingEvidenceIDs: [second, first]
        )
        XCTAssertEqual(
            SaboteurAgent.canonicalMemoryCandidate(from: [forward]),
            SaboteurAgent.canonicalMemoryCandidate(from: [reversed])
        )
    }

    func testXMemoCandidateWithoutStructuredClaimsCannotBeSealed() async throws {
        let memory = MemoryWriteSpy()
        let unstructuredText = "A free-form note with no evidence mapping."
        let engine = FixedContextualEngine(result: ReasoningResult(
            output: [1],
            confidence: 0.99,
            memoryCandidate: unstructuredText
        ))
        let orchestrator = ExocortexOrchestrator(engine: engine, memoryStore: memory)
        let decision = try await orchestrator.think(
            seed: [0],
            context: CognitiveTurnContext(),
            budget: ThermalGuardian.budget(for: .nominal)
        )
        XCTAssertTrue(decision.approved)
        XCTAssertFalse(decision.memoryCandidateValidation?.mayPersist == true)
        XCTAssertNil(decision.memoryProof)
        do {
            _ = try await orchestrator.rememberValidated(
                unstructuredText,
                decision: decision,
                consent: true,
                userAccessToken: "session"
            )
            XCTFail("Free-form text without structured evidence claims must not be persisted")
        } catch { XCTAssertEqual(error as? ExocortexError, .validationRejected) }
        let writes = await memory.writeCount()
        XCTAssertEqual(writes, 0)
    }

    func testXMemoCandidateWithExtraUnverifiedTextCannotBeSealed() async throws {
        let fact = EvidenceRecord(
            propositionKey: "device.chip",
            value: "M1",
            source: .xmemo,
            provenance: "xmemo://device/chip"
        )
        let claim = EvidenceClaim(
            propositionKey: "device.chip",
            value: "M1",
            supportingEvidenceIDs: [fact.id]
        )
        let canonical = try XCTUnwrap(SaboteurAgent.canonicalMemoryCandidate(from: [claim]))
        let appended = canonical + "\\nAdditional claim: this device has 64 GB RAM."
        let validation = SaboteurAgent().validateMemoryCandidate(
            candidate: appended,
            claims: [claim],
            context: CognitiveTurnContext(memoryEvidence: [fact])
        )
        XCTAssertFalse(validation.mayPersist)
        XCTAssertEqual(validation.unknownClaims, ["memoryCandidate.contains_unbound_text"])
    }

    func testApprovedDecisionWithoutMemoryCandidateCannotPersist() async throws {
        let memory = MemoryWriteSpy()
        let engine = FixedContextualEngine(result: ReasoningResult(output: [1], confidence: 0.99))
        let orchestrator = ExocortexOrchestrator(engine: engine, memoryStore: memory)
        let decision = try await orchestrator.think(
            seed: [0],
            context: CognitiveTurnContext(),
            budget: ThermalGuardian.budget(for: .nominal)
        )
        XCTAssertTrue(decision.approved)
        XCTAssertNil(decision.memoryProof)
        do {
            _ = try await orchestrator.rememberValidated(
                "No candidate was validated.",
                decision: decision,
                consent: true,
                userAccessToken: "session"
            )
            XCTFail("No approved candidate means no persistence")
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
            observedAt: .now
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
                completedAt: .now
            )
        )
        XCTAssertEqual(toolFact.source, .tool)
        let xmemoFact = EvidenceRecord(
            propositionKey: "device.chip",
            value: "M1",
            source: .xmemo,
            provenance: "xmemo://memory/42",
            observedAt: .now
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


    func testLocalRuntimeOutputAndFailureAreRecordedBeforeSaboteurAudit() async throws {
        let successEngine = ContextCaptureEngine(result: ReasoningResult(output: [1], confidence: 0.99))
        let successRuntime = StubLocalRuntime(response: "Generated draft; verify independently.", failure: nil)
        let successOrchestrator = ExocortexOrchestrator(engine: successEngine, localRuntime: successRuntime)
        let successDecision = try await successOrchestrator.think(seed: [0], context: CognitiveTurnContext(), budget: ThermalGuardian.budget(for: .nominal))
        let successContext = await successEngine.capturedContext()
        XCTAssertTrue(successDecision.approved)
        XCTAssertEqual(successContext?.runtimeObservations.last?.status, "completed")
        XCTAssertEqual(successContext?.runtimeObservations.last?.output, "Generated draft; verify independently.")
        XCTAssertEqual(successContext?.runtimeObservations.last?.provenance, "localRuntime")
        XCTAssertTrue(successContext?.allEvidence.isEmpty ?? false)

        let failureEngine = ContextCaptureEngine(result: ReasoningResult(output: [1], confidence: 0.99))
        let failureRuntime = StubLocalRuntime(response: nil, failure: .memoryPressure)
        let failureOrchestrator = ExocortexOrchestrator(engine: failureEngine, localRuntime: failureRuntime)
        _ = try await failureOrchestrator.think(seed: [0], context: CognitiveTurnContext(), budget: ThermalGuardian.budget(for: .nominal))
        let failureContext = await failureEngine.capturedContext()
        XCTAssertEqual(failureContext?.runtimeObservations.last?.status, "memoryPressure")
        XCTAssertEqual(failureContext?.runtimeObservations.last?.error, "memoryPressure")
        XCTAssertTrue(failureContext?.allEvidence.isEmpty ?? false)
    }


    func testLocalRuntimeOutputRequiresConcordantEvidenceForApproval() async throws {
        let generated = "The device uses an M1 chip."
        let unsupportedEngine = FixedContextualEngine(result: ReasoningResult(
            output: [1], confidence: 0.99,
            claims: [EvidenceClaim(propositionKey: "device.chip", value: "M1")]
        ))
        let unsupportedMemory = MemoryWriteSpy()
        let unsupportedOrchestrator = ExocortexOrchestrator(
            engine: unsupportedEngine,
            memoryStore: unsupportedMemory,
            localRuntime: StubLocalRuntime(response: generated, failure: nil)
        )
        let unsupported = try await unsupportedOrchestrator.think(
            seed: [0], context: CognitiveTurnContext(),
            budget: ThermalGuardian.budget(for: .nominal)
        )
        XCTAssertFalse(unsupported.approved)
        XCTAssertEqual(unsupported.reason, "evidence_unknown_or_unsupported")
        do {
            _ = try await unsupportedOrchestrator.rememberValidated("unverified", decision: unsupported, consent: true, userAccessToken: "session")
            XCTFail("Unproven runtime output must not be persisted")
        } catch { XCTAssertEqual(error as? ExocortexError, .validationRejected) }
        let unsupportedWrites = await unsupportedMemory.writeCount()
        XCTAssertEqual(unsupportedWrites, 0)

        let fact = EvidenceRecord(propositionKey: "device.chip", value: "M1", source: .xmemo, provenance: "xmemo://device/chip")
        let supportedEngine = FixedContextualEngine(result: ReasoningResult(
            output: [1], confidence: 0.99,
            claims: [EvidenceClaim(propositionKey: "device.chip", value: "M1", supportingEvidenceIDs: [fact.id])]
        ))
        let supportedOrchestrator = ExocortexOrchestrator(
            engine: supportedEngine,
            localRuntime: StubLocalRuntime(response: generated, failure: nil)
        )
        let supported = try await supportedOrchestrator.think(
            seed: [0], context: CognitiveTurnContext(memoryEvidence: [fact]),
            budget: ThermalGuardian.budget(for: .nominal)
        )
        XCTAssertTrue(supported.approved)
        XCTAssertEqual(supported.reason, "structural_and_evidence_checks_passed")
    }

    func testLocalRuntimeErrorsAlwaysBlockXMemoPersistence() async throws {
        let cases: [(ExocortexError, String)] = [
            (.thermalLimit, "thermalLimit"),
            (.memoryUnavailable, "memoryUnavailable"),
            (.memoryPressure, "memoryPressure"),
            (.runtimeUnavailable, "runtimeUnavailable"),
            (.modelNotLoaded, "modelNotLoaded")
        ]
        for (failure, expectedStatus) in cases {
            let memory = MemoryWriteSpy()
            let engine = FixedContextualEngine(result: ReasoningResult(output: [1], confidence: 0.99))
            let orchestrator = ExocortexOrchestrator(
                engine: engine,
                memoryStore: memory,
                localRuntime: StubLocalRuntime(response: nil, failure: failure)
            )
            let decision = try await orchestrator.think(
                seed: [0], context: CognitiveTurnContext(),
                budget: ThermalGuardian.budget(for: .nominal)
            )
            XCTAssertFalse(decision.approved)
            XCTAssertEqual(decision.reason, "local_runtime_failed")
            do {
                _ = try await orchestrator.rememberValidated("runtime failure", decision: decision, consent: true, userAccessToken: "session")
                XCTFail("Runtime failure must block persistence: \(expectedStatus)")
            } catch { XCTAssertEqual(error as? ExocortexError, .validationRejected) }
            let writes = await memory.writeCount()
            XCTAssertEqual(writes, 0)
        }
    }


    func testLlamaRuntimeMissingModelFailsClosed() async throws {
        let backend = LlamaBackendSpy()
        let missing = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".gguf")
        let runtime = LlamaCppRuntimeAdapter(
            locator: LlamaCppModelLocator(modelURL: missing), backend: backend,
            safety: FixedRuntimeSafetyMonitor(state: RuntimeSafetySnapshot(availableMemoryBytes: 4_000_000_000, thermalCondition: .nominal))
        )
        do {
            try await runtime.load(LocalModelDescriptor(identifier: "test", quantization: "Q4", maximumResidentBytes: 100))
            XCTFail("Missing GGUF must not load")
        } catch { XCTAssertEqual(error as? ExocortexError, .modelNotLoaded) }
        do {
            _ = try await runtime.infer(prompt: "hello", cycleBudget: 1)
            XCTFail("Inference must fail when no model is loaded")
        } catch { XCTAssertEqual(error as? ExocortexError, .modelNotLoaded) }
        let counts = await backend.counts()
        XCTAssertEqual(counts.0, 0)
        XCTAssertEqual(counts.2, 0)
    }

    func testLlamaRuntimeUnavailableMemoryHasDistinctFailure() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".gguf")
        try Data([0x47, 0x47, 0x55, 0x46]).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        let backend = LlamaBackendSpy()
        let runtime = LlamaCppRuntimeAdapter(
            locator: LlamaCppModelLocator(modelURL: url), backend: backend,
            safety: FixedRuntimeSafetyMonitor(state: RuntimeSafetySnapshot(availableMemoryBytes: -1, thermalCondition: .nominal))
        )
        do {
            try await runtime.load(LocalModelDescriptor(identifier: "test", quantization: "Q4", maximumResidentBytes: 100))
            XCTFail("Unknown memory must block loading")
        } catch { XCTAssertEqual(error as? ExocortexError, .memoryUnavailable) }
        let counts = await backend.counts()
        XCTAssertEqual(counts.0, 0)
        XCTAssertEqual(counts.1, 1)
    }

    func testLlamaRuntimeMemoryCeilingTriggersUnload() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".gguf")
        try Data([0x47, 0x47, 0x55, 0x46]).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        let backend = LlamaBackendSpy()
        let runtime = LlamaCppRuntimeAdapter(
            locator: LlamaCppModelLocator(modelURL: url), backend: backend,
            safety: FixedRuntimeSafetyMonitor(state: RuntimeSafetySnapshot(availableMemoryBytes: 400, thermalCondition: .nominal)),
            minimumLoadMemoryBytes: 1_000, criticalMemoryBytes: 500
        )
        do {
            try await runtime.load(LocalModelDescriptor(identifier: "test", quantization: "Q4", maximumResidentBytes: 100))
            XCTFail("Memory ceiling must block loading")
        } catch { XCTAssertEqual(error as? ExocortexError, .memoryPressure) }
        let counts = await backend.counts()
        XCTAssertEqual(counts.0, 0)
        XCTAssertEqual(counts.1, 1)
    }

    func testLlamaRuntimeThermalLimitTriggersUnload() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".gguf")
        try Data([0x47, 0x47, 0x55, 0x46]).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        let backend = LlamaBackendSpy()
        let runtime = LlamaCppRuntimeAdapter(
            locator: LlamaCppModelLocator(modelURL: url), backend: backend,
            safety: FixedRuntimeSafetyMonitor(state: RuntimeSafetySnapshot(availableMemoryBytes: 4_000, thermalCondition: .critical)),
            minimumLoadMemoryBytes: 1_000, criticalMemoryBytes: 500
        )
        do {
            try await runtime.load(LocalModelDescriptor(identifier: "test", quantization: "Q4", maximumResidentBytes: 100))
            XCTFail("Critical thermal state must block loading")
        } catch { XCTAssertEqual(error as? ExocortexError, .thermalLimit) }
        let counts = await backend.counts()
        XCTAssertEqual(counts.0, 0)
        XCTAssertEqual(counts.1, 1)
    }

    func testLlamaRuntimeExplicitUnloadClearsInternalState() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".gguf")
        try Data([0x47, 0x47, 0x55, 0x46]).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        let backend = LlamaBackendSpy()
        let runtime = LlamaCppRuntimeAdapter(
            locator: LlamaCppModelLocator(modelURL: url), backend: backend,
            safety: FixedRuntimeSafetyMonitor(state: RuntimeSafetySnapshot(availableMemoryBytes: 4_000_000_000, thermalCondition: .nominal)),
            minimumLoadMemoryBytes: 1_000, criticalMemoryBytes: 500
        )
        try await runtime.load(LocalModelDescriptor(identifier: "test", quantization: "Q4", maximumResidentBytes: 100))
        let response = try await runtime.infer(prompt: "hello", cycleBudget: 1)
        XCTAssertEqual(response, "local response")
        await runtime.emergencyUnload()
        do {
            _ = try await runtime.infer(prompt: "again", cycleBudget: 1)
            XCTFail("Unloaded runtime must reject inference")
        } catch { XCTAssertEqual(error as? ExocortexError, .modelNotLoaded) }
        let counts = await backend.counts()
        XCTAssertEqual(counts.0, 1)
        XCTAssertEqual(counts.1, 1)
        XCTAssertEqual(counts.2, 1)
    }

    func testRuntimeSafetyUnknownMemoryFailsClosed() {
        let unknown = RuntimeSafetySnapshot(availableMemoryBytes: -1, thermalCondition: .nominal)
        XCTAssertEqual(unknown.availableMemoryBytes, -1)
        XCTAssertFalse(ThermalGuardian.allowsInference(unknown, minimumMemoryBytes: 1))
        XCTAssertTrue(ThermalGuardian.shouldEmergencyUnload(unknown, criticalMemoryBytes: 512_000_000))
    }

    func testRuntimeSafetyUnavailableMemoryBlocksAndRequestsUnload() {
        let unavailable = RuntimeSafetySnapshot(availableMemoryBytes: -1, thermalCondition: .nominal)
        XCTAssertFalse(ThermalGuardian.allowsInference(unavailable, minimumMemoryBytes: 1))
        XCTAssertTrue(ThermalGuardian.shouldEmergencyUnload(unavailable, criticalMemoryBytes: 512_000_000))
    }

    func testRuntimeSafetyThermalAndMemoryFallbacks() {
        let fair = RuntimeSafetySnapshot(availableMemoryBytes: 2_000_000_000, thermalCondition: .fair)
        let serious = RuntimeSafetySnapshot(availableMemoryBytes: 2_000_000_000, thermalCondition: .serious)
        let lowMemory = RuntimeSafetySnapshot(availableMemoryBytes: 100_000_000, thermalCondition: .nominal)
        let critical = RuntimeSafetySnapshot(availableMemoryBytes: 2_000_000_000, thermalCondition: .critical)

        XCTAssertEqual(ThermalGuardian.budget(for: .fair).maximumContextTokens, 2048)
        XCTAssertEqual(ThermalGuardian.budget(for: .serious).maximumContextTokens, 512)
        XCTAssertFalse(ThermalGuardian.allowsInference(critical, minimumMemoryBytes: 1))
        XCTAssertFalse(ThermalGuardian.allowsInference(lowMemory, minimumMemoryBytes: 512_000_000))
        XCTAssertTrue(ThermalGuardian.shouldEmergencyUnload(lowMemory, criticalMemoryBytes: 512_000_000))
        XCTAssertTrue(ThermalGuardian.shouldEmergencyUnload(critical, criticalMemoryBytes: 512_000_000))
        XCTAssertTrue(ThermalGuardian.allowsInference(fair, minimumMemoryBytes: 512_000_000))
        XCTAssertTrue(ThermalGuardian.allowsInference(serious, minimumMemoryBytes: 512_000_000))
    }

    func testVoiceFeaturesAreAcousticOnly() throws {
        let features = try VoiceBiometricMonitor.analyze([1, -1, 1, -1])
        XCTAssertEqual(features.rms, 1, accuracy: 0.0001)
        XCTAssertEqual(features.peak, 1, accuracy: 0.0001)
        XCTAssertGreaterThan(features.zeroCrossingRate, 0)
    }

    func testTensorBusTwelveConcurrentLeasesRemainIsolated() async throws {
        let bus = try NeuralBus(dimension: 512, capacity: 64, preferMetal: false)
        try await withThrowingTaskGroup(of: (Int, [Float]).self) { group in
            for task in 0..<12 {
                group.addTask {
                    let lease = try await bus.leaseSlot()
                    let values = Array(repeating: Float(task + 1), count: 512)
                    try await bus.write(values, using: lease)
                    let result = try await bus.read(using: lease)
                    try await bus.release(lease)
                    return (task, result)
                }
            }
            for try await (task, values) in group {
                XCTAssertEqual(values, Array(repeating: Float(task + 1), count: 512))
            }
        }
    }
    func testTensorBusRejectsAccessAfterLeaseRelease() async throws {
        let bus = try NeuralBus(dimension: 512, capacity: 2, preferMetal: false)
        let lease = try await bus.leaseSlot()
        try await bus.write(Array(repeating: 7, count: 512), using: lease)
        try await bus.release(lease)
        do { _ = try await bus.read(using: lease); XCTFail("Released lease must reject reads") }
        catch { XCTAssertEqual(error as? ExocortexError, .invalidLease) }
        do { try await bus.write(Array(repeating: 8, count: 512), using: lease); XCTFail("Released lease must reject writes") }
        catch { XCTAssertEqual(error as? ExocortexError, .invalidLease) }
    }
    func testTensorStoreBoundsAndSlotIsolation() throws {
        let store = try CPUTensorStore(capacity: 2, dimension: 4)
        try store.write([1,2,3,4],slot:0);try store.write([5,6,7,8],slot:1)
        XCTAssertEqual(try store.read(slot:0),[1,2,3,4])
        XCTAssertEqual(try store.read(slot:1),[5,6,7,8])
        XCTAssertThrowsError(try store.read(slot:2))
    }

}
