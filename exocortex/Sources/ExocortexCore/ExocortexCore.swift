import Foundation
import CryptoKit
#if os(macOS)
import Darwin
#endif
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum ExocortexError: Error, Equatable, Sendable { case invalidDimension, dimensionMismatch, invalidVector, memoryConsentRequired, invalidEndpoint, invalidResponse, httpStatus(Int), toolNotAllowed, invalidPayload, contextualEngineRequired, validationRejected, runtimeUnavailable, thermalLimit, memoryUnavailable, memoryPressure, modelNotLoaded, invalidLease }
public struct VectorMessage: Codable, Equatable, Sendable {
 public let id:UUID; public let source:String; public let values:[Float]; public let createdAt:Date
 public init(id:UUID=UUID(),source:String,values:[Float],createdAt:Date = .now){self.id=id;self.source=source;self.values=values;self.createdAt=createdAt}
}
// 1 NeuralBus
public actor NeuralBus {
 private let dimension:Int;private let capacity:Int;private var messages:[VectorMessage]=[]
 private let tensorStore:any TensorBackingStore
 private var activeLeases:Set<TensorSlotLease>=[]
 public init(dimension:Int=512,capacity:Int=64,preferMetal:Bool=true)throws{
  guard dimension>0,capacity>0 else{throw ExocortexError.invalidDimension}
  self.dimension=dimension;self.capacity=capacity
  self.tensorStore=try TensorStoreFactory.make(capacity:capacity,dimension:dimension,preferMetal:preferMetal)
 }
 public func publish(_ message:VectorMessage)throws{guard message.values.count==dimension else{throw ExocortexError.dimensionMismatch};guard message.values.allSatisfy(\.isFinite) else{throw ExocortexError.invalidVector};messages.append(message);if messages.count>capacity{messages.removeFirst(messages.count-capacity)}}
 public func latest(limit:Int=16)->[VectorMessage]{Array(messages.suffix(max(0,min(limit,capacity))))}
 public func leaseSlot() throws -> TensorSlotLease {
  guard let slot=(0..<capacity).first(where:{ candidate in !activeLeases.contains(where:{$0.slot == candidate}) }) else { throw ExocortexError.invalidPayload }
  let lease=TensorSlotLease(slot:slot);activeLeases.insert(lease);return lease
 }
 public func write(_ values:[Float],using lease:TensorSlotLease)throws {
  guard activeLeases.contains(lease) else { throw ExocortexError.invalidLease }
  guard values.count==dimension else { throw ExocortexError.dimensionMismatch }
  try tensorStore.write(values,slot:lease.slot)
 }
 public func read(using lease:TensorSlotLease)throws->[Float] {
  guard activeLeases.contains(lease) else { throw ExocortexError.invalidLease }
  return try tensorStore.read(slot:lease.slot)
 }
 public func release(_ lease:TensorSlotLease)throws {
  guard activeLeases.remove(lease) != nil else { throw ExocortexError.invalidLease }
  try tensorStore.clear(slot:lease.slot)
 }
 public func clear(){messages.removeAll(keepingCapacity:false);for lease in activeLeases {try? tensorStore.clear(slot:lease.slot)};activeLeases.removeAll()}
}
// 2 ThermalGuardian — real device signals behind injectable testable providers
public enum ThermalCondition: Sendable, Equatable { case nominal, fair, serious, critical, unknown }
public struct ThermalBudget: Equatable, Sendable {
    public let reasoningCycles: Int
    public let maxConcurrentAgents: Int
    public let permitsEvolution: Bool
    public let maximumContextTokens: Int
    public init(reasoningCycles: Int, maxConcurrentAgents: Int, permitsEvolution: Bool, maximumContextTokens: Int = 4096) {
        self.reasoningCycles = max(1, reasoningCycles)
        self.maxConcurrentAgents = max(1, maxConcurrentAgents)
        self.permitsEvolution = permitsEvolution
        self.maximumContextTokens = max(128, maximumContextTokens)
    }
}
public struct RuntimeSafetySnapshot: Sendable, Equatable {
    public let availableMemoryBytes: Int64
    public let thermalCondition: ThermalCondition
    public init(availableMemoryBytes: Int64, thermalCondition: ThermalCondition) {
        self.availableMemoryBytes = availableMemoryBytes < 0 ? -1 : availableMemoryBytes
        self.thermalCondition = thermalCondition
    }
}
public protocol RuntimeSafetyMonitoring: Sendable {
    func snapshot() -> RuntimeSafetySnapshot
}
/// Returns the host page size without reading the mutable vm_kernel_page_size C global.
func exocortexSystemPageSizeBytes() -> UInt64? {
    let pageSize = getpagesize()
    guard pageSize > 0 else { return nil }
    return UInt64(pageSize)
}

public struct SystemRuntimeSafetyMonitor: RuntimeSafetyMonitoring {
    public init() {}
    public func snapshot() -> RuntimeSafetySnapshot {
        let memory: Int64
        #if os(iOS) || os(tvOS) || os(watchOS)
        memory = Int64(os_proc_available_memory())
        #elseif os(macOS)
        // macOS does not expose the iOS per-process memory budget API.
        // Estimate immediately available/reclaimable host memory from free + inactive pages.
        var statistics = vm_statistics64_data_t()
        var count = mach_msg_type_number_t(
            MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size
        )
        let host = mach_host_self()
        let result = withUnsafeMutablePointer(to: &statistics) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(host, HOST_VM_INFO64, $0, &count)
            }
        }
        mach_port_deallocate(mach_task_self_, host)
        let freePages = Int64(statistics.free_count)
        let inactivePages = Int64(statistics.inactive_count)
        let (pageCount, pageCountOverflow) = freePages.addingReportingOverflow(inactivePages)
        let pageSize = exocortexSystemPageSizeBytes()
        let (availableBytes, byteCountOverflow) = UInt64(max(0, pageCount))
            .multipliedReportingOverflow(by: pageSize ?? 0)
        memory = result == KERN_SUCCESS && !pageCountOverflow && !byteCountOverflow &&
            pageSize != nil && availableBytes <= UInt64(Int64.max)
            ? Int64(availableBytes) : -1
        #else
        memory = -1 // UNKNOWN on unsupported hosts; never interpreted as unlimited memory.
        #endif
        let thermal: ThermalCondition
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: thermal = .nominal
        case .fair: thermal = .fair
        case .serious: thermal = .serious
        case .critical: thermal = .critical
        @unknown default: thermal = .unknown
        }
        return RuntimeSafetySnapshot(availableMemoryBytes: memory, thermalCondition: thermal)
    }
}
public enum ThermalGuardian {
    public static func budget(for condition: ThermalCondition) -> ThermalBudget {
        switch condition {
        case .nominal: return ThermalBudget(reasoningCycles: 12, maxConcurrentAgents: 2, permitsEvolution: true, maximumContextTokens: 4096)
        case .fair: return ThermalBudget(reasoningCycles: 6, maxConcurrentAgents: 1, permitsEvolution: false, maximumContextTokens: 2048)
        case .serious: return ThermalBudget(reasoningCycles: 2, maxConcurrentAgents: 1, permitsEvolution: false, maximumContextTokens: 512)
        case .critical, .unknown: return ThermalBudget(reasoningCycles: 1, maxConcurrentAgents: 1, permitsEvolution: false, maximumContextTokens: 128)
        }
    }
    public static func allowsInference(_ snapshot: RuntimeSafetySnapshot, minimumMemoryBytes: Int64) -> Bool {
        guard snapshot.thermalCondition != .critical, snapshot.thermalCondition != .unknown else { return false }
        guard snapshot.availableMemoryBytes >= 0 else { return false }
        return snapshot.availableMemoryBytes >= minimumMemoryBytes
    }
    public static func shouldEmergencyUnload(_ snapshot: RuntimeSafetySnapshot, criticalMemoryBytes: Int64) -> Bool {
        snapshot.thermalCondition == .critical || snapshot.thermalCondition == .unknown ||
        snapshot.availableMemoryBytes < 0 || snapshot.availableMemoryBytes < criticalMemoryBytes
    }
}
public protocol MemoryHTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}
public actor URLSessionMemoryTransport: MemoryHTTPTransport {
    private let session: URLSession
    public init(session: URLSession = .shared) { self.session = session }
    public func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        try await session.data(for: request)
    }
}
// 3 XMemo durable memory; old FractalMemory replaced by RAM-only cache
public struct MemoryRecall: Codable, Sendable, Equatable {
    public let status: String
    public let context: String
}
public struct MemoryReceipt: Codable, Sendable, Equatable {
    public let status: String
    public let receipt: String?
}
public enum EvidenceSource: String, Codable, Sendable { case xmemo, workingSet, tool, runtime }
public enum EvidencePolarity: String, Codable, Sendable { case affirmed, denied }
public struct EvidenceRecord: Codable, Sendable, Equatable {
    public let id: UUID
    public let propositionKey: String
    public let value: String
    public let polarity: EvidencePolarity
    public let source: EvidenceSource
    public let provenance: String
    public let score: Double?
    public let observedAt: Date
    public init(id: UUID = UUID(), propositionKey: String, value: String, polarity: EvidencePolarity = .affirmed, source: EvidenceSource, provenance: String, score: Double? = nil, observedAt: Date = .now) {
        self.id = id
        self.propositionKey = propositionKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        self.value = value
        self.polarity = polarity
        self.source = source
        self.provenance = provenance
        self.score = score
        self.observedAt = observedAt
    }
}
public struct EvidenceClaim: Codable, Sendable, Equatable {
    public let propositionKey: String
    public let value: String
    public let polarity: EvidencePolarity
    public let supportingEvidenceIDs: [UUID]
    public init(propositionKey: String, value: String, polarity: EvidencePolarity = .affirmed, supportingEvidenceIDs: [UUID] = []) {
        self.propositionKey = propositionKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        self.value = value
        self.polarity = polarity
        self.supportingEvidenceIDs = supportingEvidenceIDs
    }
}
public enum EvidenceDisposition: String, Codable, Sendable { case accepted, rejected }
public struct EvidenceValidation: Codable, Sendable, Equatable {
    public let disposition: EvidenceDisposition
    public let contradictions: [String]
    public let unknownClaims: [String]
    public let unsupportedClaims: [String]
    public var mayPersist: Bool {
        disposition == .accepted && contradictions.isEmpty && unknownClaims.isEmpty && unsupportedClaims.isEmpty
    }
}
public struct EvidenceLedger: Sendable {
    public init() {}
    public func evaluate(claims: [EvidenceClaim], against records: [EvidenceRecord]) -> EvidenceValidation {
        var contradictions: [String] = []
        var unknown: [String] = []
        var unsupported: [String] = []
        for claim in claims {
            let matches = records.filter { $0.propositionKey == claim.propositionKey }
            let conflict = matches.contains {
                $0.polarity != claim.polarity || $0.value.caseInsensitiveCompare(claim.value) != .orderedSame
            }
            if conflict {
                contradictions.append(claim.propositionKey)
                continue
            }
            let cited = Set(claim.supportingEvidenceIDs)
            let supported = matches.contains {
                $0.polarity == claim.polarity &&
                $0.value.caseInsensitiveCompare(claim.value) == .orderedSame &&
                (!cited.isEmpty && cited.contains($0.id))
            }
            if !supported {
                unknown.append(claim.propositionKey)
                if !cited.isEmpty { unsupported.append(claim.propositionKey) }
            }
        }
        let uniqueContradictions = Array(Set(contradictions)).sorted()
        let uniqueUnknown = Array(Set(unknown)).sorted()
        let uniqueUnsupported = Array(Set(unsupported)).sorted()
        let accepted = uniqueContradictions.isEmpty && uniqueUnknown.isEmpty
        return EvidenceValidation(
            disposition: accepted ? .accepted : .rejected,
            contradictions: uniqueContradictions,
            unknownClaims: uniqueUnknown,
            unsupportedClaims: uniqueUnsupported
        )
    }
}
public struct CognitiveTurnContext: Sendable, Equatable {
    public let memoryRecall: MemoryRecall?
    public let memoryEvidence: [EvidenceRecord]
    public let workingSetEvidence: [EvidenceRecord]
    public let toolEvidence: [EvidenceRecord]
    public let evidence: [EvidenceRecord]
    public let claims: [EvidenceClaim]
    public let runtimeObservations: [LocalRuntimeObservation]
    public init(memoryRecall: MemoryRecall? = nil, memoryEvidence: [EvidenceRecord] = [], workingSetEvidence: [EvidenceRecord] = [], toolEvidence: [EvidenceRecord] = [], evidence: [EvidenceRecord] = [], claims: [EvidenceClaim] = [], runtimeObservations: [LocalRuntimeObservation] = []) {
        self.memoryRecall = memoryRecall
        self.memoryEvidence = memoryEvidence
        self.workingSetEvidence = workingSetEvidence
        self.toolEvidence = toolEvidence
        self.evidence = evidence
        self.claims = claims
        self.runtimeObservations = runtimeObservations
    }
    /// Raw XMemo text is context, not proof. Only structured, provenance-bearing records enter the ledger.
    public var allEvidence: [EvidenceRecord] { evidence + memoryEvidence + workingSetEvidence + toolEvidence }
    public func addingEvidence(memory: [EvidenceRecord] = [], workingSet: [EvidenceRecord] = [], tools: [EvidenceRecord] = []) -> CognitiveTurnContext {
        CognitiveTurnContext(
            memoryRecall: memoryRecall,
            memoryEvidence: memoryEvidence + memory,
            workingSetEvidence: workingSetEvidence + workingSet,
            toolEvidence: toolEvidence + tools,
            evidence: evidence,
            claims: claims,
            runtimeObservations: runtimeObservations
        )
    }
    /// Runtime output is an execution observation, never automatically factual evidence.
    public func addingRuntimeObservation(_ observation: LocalRuntimeObservation) -> CognitiveTurnContext {
        CognitiveTurnContext(
            memoryRecall: memoryRecall,
            memoryEvidence: memoryEvidence,
            workingSetEvidence: workingSetEvidence,
            toolEvidence: toolEvidence,
            evidence: evidence,
            claims: claims,
            runtimeObservations: runtimeObservations + [observation]
        )
    }
}

public protocol DurableMemoryStore:Sendable{
 func recall(_ query:String,consent:Bool,userAccessToken:String)async throws->MemoryRecall
 func remember(_ content:String,consent:Bool,userAccessToken:String)async throws->MemoryReceipt
}
/// Uses the authenticated HQ gateway. XMemo OAuth credentials remain server-side.
public actor XMemoMemoryStore: DurableMemoryStore {
    private let gatewayURL: URL
    private let anonKey: String
    private let transport: any MemoryHTTPTransport
    public init(gatewayURL: URL, anonKey: String, session: URLSession = .shared, transport: (any MemoryHTTPTransport)? = nil) throws {
        guard gatewayURL.scheme == "https", gatewayURL.host != nil, !anonKey.isEmpty else {
            throw ExocortexError.invalidEndpoint
        }
        guard var components = URLComponents(url: gatewayURL, resolvingAgainstBaseURL: false) else {
            throw ExocortexError.invalidEndpoint
        }
        components.path = components.path.replacingOccurrences(of: "/+$", with: "", options: .regularExpression) + "/"
        guard let normalized = components.url else { throw ExocortexError.invalidEndpoint }
        self.gatewayURL = normalized
        self.anonKey = anonKey
        self.transport = transport ?? URLSessionMemoryTransport(session: session)
    }
    private struct RecallRequest: Encodable { let consent: Bool; let query: String }
    private struct RememberRequest: Encodable { let consent: Bool; let content: String }
    private struct RecallResponse: Decodable { let status: String; let context: String? }
    private struct RememberResponse: Decodable { let status: String; let receipt: String? }
    public func recall(_ query: String, consent: Bool, userAccessToken: String) async throws -> MemoryRecall {
        guard consent else { throw ExocortexError.memoryConsentRequired }
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, query.count <= 12_000 else {
            throw ExocortexError.invalidPayload
        }
        let response: RecallResponse = try await post(
            path: "memory/xmemo/recall",
            body: RecallRequest(consent: true, query: query),
            token: userAccessToken
        )
        return MemoryRecall(status: response.status, context: response.context ?? "")
    }
    public func remember(_ content: String, consent: Bool, userAccessToken: String) async throws -> MemoryReceipt {
        guard consent else { throw ExocortexError.memoryConsentRequired }
        guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, content.count <= 18_000 else {
            throw ExocortexError.invalidPayload
        }
        let response: RememberResponse = try await post(
            path: "memory/xmemo/remember",
            body: RememberRequest(consent: true, content: content),
            token: userAccessToken
        )
        return MemoryReceipt(status: response.status, receipt: response.receipt)
    }
    private func post<Body: Encodable, Response: Decodable>(path: String, body: Body, token: String) async throws -> Response {
        guard !token.isEmpty, let url = URL(string: path, relativeTo: gatewayURL)?.absoluteURL else {
            throw ExocortexError.invalidEndpoint
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await transport.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ExocortexError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw ExocortexError.httpStatus(http.statusCode) }
        do { return try JSONDecoder().decode(Response.self, from: data) }
        catch { throw ExocortexError.invalidResponse }
    }
}
/// Temporary cache only, never a second durable memory database.
public actor EphemeralWorkingSet {
    private struct Entry: Sendable { let vector: [Float]; let expiry: Date }
    private var entries: [UUID: Entry] = [:]
    private var evidenceEntries: [UUID: EvidenceRecord] = [:]
    private let ttl: TimeInterval
    private let capacity: Int
    public init(ttl: TimeInterval = 172_800, capacity: Int = 128) {
        self.ttl = max(1, ttl)
        self.capacity = max(1, capacity)
    }
    public func store(_ vector: [Float], now: Date = .now) throws -> UUID {
        guard !vector.isEmpty, vector.allSatisfy(\.isFinite) else { throw ExocortexError.invalidVector }
        purge(now)
        if entries.count >= capacity, let key = entries.min(by: { $0.value.expiry < $1.value.expiry })?.key {
            entries.removeValue(forKey: key)
        }
        let id = UUID()
        entries[id] = Entry(vector: vector, expiry: now.addingTimeInterval(ttl))
        return id
    }
    public func nearest(to query: [Float], now: Date = .now) throws -> [Float]? {
        guard !query.isEmpty, query.allSatisfy(\.isFinite) else { throw ExocortexError.invalidVector }
        purge(now)
        return entries.values.filter { $0.vector.count == query.count }
            .max { cosine($0.vector, query) < cosine($1.vector, query) }?.vector
    }
    /// Adds a provenance-bearing fact to the same bounded, expiring RAM-only working set.
    public func storeEvidence(_ record: EvidenceRecord, now: Date = .now) throws {
        guard record.source == .workingSet,
              !record.propositionKey.isEmpty,
              !record.value.isEmpty,
              !record.provenance.isEmpty else { throw ExocortexError.invalidPayload }
        purge(now)
        if evidenceEntries.count >= capacity,
           let key = evidenceEntries.min(by: { $0.value.observedAt < $1.value.observedAt })?.key {
            evidenceEntries.removeValue(forKey: key)
        }
        evidenceEntries[record.id] = record
    }
    public func evidenceSnapshot(now: Date = .now) -> [EvidenceRecord] {
        purge(now)
        return evidenceEntries.values.sorted { $0.observedAt < $1.observedAt }
    }
    public func count(now: Date = .now) -> Int {
        purge(now)
        return entries.count + evidenceEntries.count
    }
    public func clear() {
        entries.removeAll(keepingCapacity: false)
        evidenceEntries.removeAll(keepingCapacity: false)
    }
    private func purge(_ now: Date) {
        entries = entries.filter { $0.value.expiry > now }
        evidenceEntries = evidenceEntries.filter { $0.value.observedAt.addingTimeInterval(ttl) > now }
    }
    private func cosine(_ a: [Float], _ b: [Float]) -> Float {
        let dot = zip(a, b).reduce(Float.zero) { $0 + $1.0 * $1.1 }
        let aa = a.reduce(Float.zero) { $0 + $1 * $1 }
        let bb = b.reduce(Float.zero) { $0 + $1 * $1 }
        guard aa > 0, bb > 0 else { return 0 }
        return dot / (aa.squareRoot() * bb.squareRoot())
    }
}
// 4 Cognitive agents, Saboteur and bounded security
public protocol CognitiveAgent:Sendable{var name:String{get};func process(_ input:[Float])async throws->[Float]}
public struct SaboteurAgent: Sendable {
    public let minimumConfidence: Float
    public init(minimumConfidence: Float = 0.70) { self.minimumConfidence = min(1, max(0, minimumConfidence)) }
    public func validateStructure(output: [Float], confidence: Float?, expectedDimension: Int? = nil) -> Bool {
        guard !output.isEmpty, output.allSatisfy(\.isFinite), let confidence, confidence.isFinite,
              confidence >= minimumConfidence, confidence <= 1 else { return false }
        return expectedDimension.map { $0 > 0 && output.count == $0 } ?? true
    }
    public func validateFacts(context: CognitiveTurnContext, claims: [EvidenceClaim]) -> EvidenceValidation {
        EvidenceLedger().evaluate(claims: claims, against: context.allEvidence)
    }

    /// Produces the only persistence-safe text representation: a deterministic serialization
    /// of the exact structured claims that the evidence ledger can verify.
    public static func canonicalMemoryCandidate(from claims: [EvidenceClaim]) -> String? {
        guard !claims.isEmpty else { return nil }
        let normalizedClaims = claims.map { claim in
            EvidenceClaim(
                propositionKey: claim.propositionKey,
                value: claim.value,
                polarity: claim.polarity,
                supportingEvidenceIDs: claim.supportingEvidenceIDs.sorted {
                    $0.uuidString < $1.uuidString
                }
            )
        }
        let orderedClaims = normalizedClaims.sorted {
            if $0.propositionKey != $1.propositionKey { return $0.propositionKey < $1.propositionKey }
            if $0.value != $1.value { return $0.value < $1.value }
            if $0.polarity.rawValue != $1.polarity.rawValue { return $0.polarity.rawValue < $1.polarity.rawValue }
            return $0.supportingEvidenceIDs.map(\.uuidString).joined() <
                $1.supportingEvidenceIDs.map(\.uuidString).joined()
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(orderedClaims) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// A candidate is persistable only when every encoded byte is the canonical projection
    /// of non-empty claims, and every claim is independently supported by context evidence.
    public func validateMemoryCandidate(
        candidate: String,
        claims: [EvidenceClaim],
        context: CognitiveTurnContext
    ) -> EvidenceValidation {
        guard let canonical = Self.canonicalMemoryCandidate(from: claims) else {
            return EvidenceValidation(
                disposition: .rejected,
                contradictions: [],
                unknownClaims: ["memoryCandidate.requires_structured_claims"],
                unsupportedClaims: ["memoryCandidate.requires_structured_claims"]
            )
        }
        guard candidate == canonical else {
            return EvidenceValidation(
                disposition: .rejected,
                contradictions: [],
                unknownClaims: ["memoryCandidate.contains_unbound_text"],
                unsupportedClaims: ["memoryCandidate.contains_unbound_text"]
            )
        }
        return validateFacts(context: context, claims: claims)
    }

    public func validate(output: [Float], confidence: Float?) -> Bool {
        validateStructure(output: output, confidence: confidence)
    }
}
public enum AntiUltronShield { public static func accepts(payload: Data, maximumBytes: Int = 65_536) -> Bool { payload.count <= max(0, maximumBytes) } }
// 5 Orchestrator uses an injected contextual reasoning runtime
public struct ReasoningResult: Sendable, Equatable {
    public let output: [Float]
    public let confidence: Float?
    public let claims: [EvidenceClaim]
    /// Exact text proposed by the reasoning engine for persistence; the orchestrator hashes this only after Saboteur approval.
    public let memoryCandidate: String?
    public init(output: [Float], confidence: Float?, claims: [EvidenceClaim] = [], memoryCandidate: String? = nil) {
        self.output = output
        self.confidence = confidence
        self.claims = claims
        self.memoryCandidate = memoryCandidate
    }
}
public protocol ReasoningEngine: Sendable {
    func reason(input: [Float], cycleBudget: Int) async throws -> ReasoningResult
}
public protocol ContextualReasoningEngine: ReasoningEngine {
    func reason(context: CognitiveTurnContext, cycleBudget: Int) async throws -> ReasoningResult
}
public struct MemoryValidationProof: Sendable, Equatable {
    public let id: UUID
    public let contentSHA256: String

    public init(content: String) {
        self.id = UUID()
        self.contentSHA256 = SHA256.hash(data: Data(content.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    public func matches(_ content: String) -> Bool {
        let candidate = SHA256.hash(data: Data(content.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return candidate == contentSHA256
    }
}
public struct OrchestrationDecision: Sendable, Equatable {
    public let approved: Bool
    public let confidence: Float?
    public let output: [Float]
    public let reason: String
    public let evidenceValidation: EvidenceValidation
    public let memoryCandidateValidation: EvidenceValidation?
    public let memoryProof: MemoryValidationProof?
}
public struct ExocortexOrchestrator: Sendable {
    private let engine: any ReasoningEngine
    private let saboteur: SaboteurAgent
    private let memoryStore: (any DurableMemoryStore)?
    private let workingSet: EphemeralWorkingSet?
    private let toolRegistry: ToolRegistry?
    private let localRuntime: (any LocalModelRuntime)?
    public init(
        engine: any ReasoningEngine,
        saboteur: SaboteurAgent = SaboteurAgent(),
        memoryStore: (any DurableMemoryStore)? = nil,
        workingSet: EphemeralWorkingSet? = nil,
        toolRegistry: ToolRegistry? = nil,
        localRuntime: (any LocalModelRuntime)? = nil
    ) {
        self.engine = engine
        self.saboteur = saboteur
        self.memoryStore = memoryStore
        self.workingSet = workingSet
        self.toolRegistry = toolRegistry
        self.localRuntime = localRuntime
    }
    public func think(seed: [Float], budget: ThermalBudget) async throws -> OrchestrationDecision {
        guard !seed.isEmpty, seed.allSatisfy(\.isFinite) else { throw ExocortexError.invalidVector }
        var context = await collectEvidence(into: CognitiveTurnContext())
        context = await collectRuntimeObservation(seed: seed, budget: budget, into: context)
        let result = try await engine.reason(input: seed, cycleBudget: budget.reasoningCycles)
        return decide(result, context: context)
    }
    public func think(seed: [Float], context: CognitiveTurnContext, budget: ThermalBudget) async throws -> OrchestrationDecision {
        guard !seed.isEmpty, seed.allSatisfy(\.isFinite) else { throw ExocortexError.invalidVector }
        guard let contextualEngine = engine as? any ContextualReasoningEngine else {
            throw ExocortexError.contextualEngineRequired
        }
        var enriched = await collectEvidence(into: context)
        enriched = await collectRuntimeObservation(seed: seed, budget: budget, into: enriched)
        let result = try await contextualEngine.reason(context: enriched, cycleBudget: budget.reasoningCycles)
        return decide(result, context: enriched)
    }
    private func collectRuntimeObservation(seed: [Float], budget: ThermalBudget, into context: CognitiveTurnContext) async -> CognitiveTurnContext {
        guard let localRuntime else { return context }
        let prompt = "Input vector: " + seed.map { String($0) }.joined(separator: ",")
        do {
            let output = try await localRuntime.infer(prompt: prompt, cycleBudget: budget.reasoningCycles)
            return context.addingRuntimeObservation(LocalRuntimeObservation(status: "completed", output: output))
        } catch let error as ExocortexError {
            let status: String
            switch error {
            case .runtimeUnavailable: status = "runtimeUnavailable"
            case .thermalLimit: status = "thermalLimit"
            case .memoryPressure: status = "memoryPressure"
            case .modelNotLoaded: status = "modelNotLoaded"
            default: status = "runtimeError"
            }
            return context.addingRuntimeObservation(LocalRuntimeObservation(status: status, error: status))
        } catch {
            return context.addingRuntimeObservation(LocalRuntimeObservation(status: "runtimeError", error: String(describing: error)))
        }
    }
    private func collectEvidence(into context: CognitiveTurnContext) async -> CognitiveTurnContext {
        var memoryRecords: [EvidenceRecord] = []
        if let recall = context.memoryRecall, !recall.context.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            // This proves only that XMemo returned this exact text; it does not semantically certify claims inside it.
            memoryRecords.append(EvidenceRecord(
                propositionKey: "xmemo.recall.context",
                value: recall.context,
                source: .xmemo,
                provenance: "POST /memory/xmemo/recall",
                score: nil
            ))
        }
        let workingRecords = await workingSet?.evidenceSnapshot() ?? []
        let toolRecords = await toolRegistry?.evidenceSnapshot() ?? []
        return context.addingEvidence(memory: memoryRecords, workingSet: workingRecords, tools: toolRecords)
    }
    private func decide(_ result: ReasoningResult, context: CognitiveTurnContext) -> OrchestrationDecision {
        let structural = saboteur.validateStructure(output: result.output, confidence: result.confidence)
        let runtimeFailures = context.runtimeObservations.filter { $0.status != "completed" }
        let factual: EvidenceValidation
        if !runtimeFailures.isEmpty {
            factual = EvidenceValidation(
                disposition: .rejected,
                contradictions: [],
                unknownClaims: runtimeFailures.map { "localRuntime.status." + $0.status },
                unsupportedClaims: runtimeFailures.map { "localRuntime.status." + $0.status }
            )
        } else {
            factual = saboteur.validateFacts(context: context, claims: context.claims + result.claims)
        }
        let approved = structural && runtimeFailures.isEmpty && factual.mayPersist
        let reason: String
        if !structural { reason = "structural_validation_failed" }
        else if !runtimeFailures.isEmpty { reason = "local_runtime_failed" }
        else if !factual.contradictions.isEmpty { reason = "factual_contradiction_detected" }
        else if !factual.mayPersist { reason = "evidence_unknown_or_unsupported" }
        else { reason = "structural_and_evidence_checks_passed" }
        let candidateValidation: EvidenceValidation? = result.memoryCandidate.map { candidate in
            saboteur.validateMemoryCandidate(candidate: candidate, claims: result.claims, context: context)
        }
        return OrchestrationDecision(
            approved: approved,
            confidence: result.confidence,
            output: approved ? result.output : [],
            reason: reason,
            evidenceValidation: factual,
            memoryCandidateValidation: candidateValidation,
            memoryProof: approved && candidateValidation?.mayPersist == true
                ? result.memoryCandidate.map { MemoryValidationProof(content: $0) }
                : nil
        )
    }
    public func recallContext(_ query: String, consent: Bool, userAccessToken: String) async throws -> CognitiveTurnContext {
        guard let memoryStore else { throw ExocortexError.invalidEndpoint }
        let recall = try await memoryStore.recall(query, consent: consent, userAccessToken: userAccessToken)
        return CognitiveTurnContext(memoryRecall: recall)
    }
    public func rememberValidated(_ content: String, decision: OrchestrationDecision, consent: Bool, userAccessToken: String) async throws -> MemoryReceipt {
        guard decision.approved, decision.evidenceValidation.mayPersist,
              decision.memoryCandidateValidation?.mayPersist == true else {
            throw ExocortexError.validationRejected
        }
        guard consent else { throw ExocortexError.memoryConsentRequired }
        guard decision.memoryProof?.matches(content) == true else { throw ExocortexError.validationRejected }
        guard let memoryStore else { throw ExocortexError.invalidEndpoint }
        return try await memoryStore.remember(content, consent: true, userAccessToken: userAccessToken)
    }
}
// 6 Evolution and background scheduling contract
public struct CandidateScore:Sendable,Equatable{public let candidateID:String;public let heldOutScore:Double;public init(candidateID:String,heldOutScore:Double){self.candidateID=candidateID;self.heldOutScore=heldOutScore}}
public struct EvolutionArena:Sendable{public init(){};public func champion(from s:[CandidateScore],minimumScore:Double)->CandidateScore?{guard s.allSatisfy({$0.heldOutScore.isFinite}) else{return nil};return s.filter{$0.heldOutScore>=minimumScore}.max{$0.heldOutScore<$1.heldOutScore}}
}
public protocol BackgroundEvolutionScheduling:Sendable{func submitRequiresExternalPower()async throws}
// 7 Allowlisted tools; arbitrary JavaScript is not considered sandboxed
public struct ToolRequest: Sendable, Equatable {
    public let name: String
    public let payload: Data
    public init(name: String, payload: Data) { self.name = name; self.payload = payload }
}
public struct ToolExecutionResult: Sendable, Equatable {
    public let propositionKey: String
    public let value: String
    public let provenance: String
    public let completedAt: Date
    public init(propositionKey: String, value: String, provenance: String, completedAt: Date = .now) {
        self.propositionKey = propositionKey
        self.value = value
        self.provenance = provenance
        self.completedAt = completedAt
    }
}
public protocol ToolEvidenceJournal: Sendable {
    func append(_ record: EvidenceRecord) async throws
    func snapshot() async -> [EvidenceRecord]
}
public actor EphemeralToolEvidenceJournal: ToolEvidenceJournal {
    private var records: [EvidenceRecord] = []
    private let capacity: Int
    public init(capacity: Int = 128) { self.capacity = max(1, capacity) }
    public func append(_ record: EvidenceRecord) {
        records.append(record)
        if records.count > capacity { records.removeFirst(records.count - capacity) }
    }
    public func snapshot() -> [EvidenceRecord] { records }
}
public struct ToolRegistry: Sendable {
    private let names: Set<String>
    private let maxBytes: Int
    private let journal: any ToolEvidenceJournal
    public init(allowedNames: Set<String>, maximumPayloadBytes: Int = 65_536, journal: (any ToolEvidenceJournal)? = nil) {
        names = allowedNames
        maxBytes = max(0, maximumPayloadBytes)
        self.journal = journal ?? EphemeralToolEvidenceJournal()
    }
    public func validate(_ request: ToolRequest) throws {
        guard names.contains(request.name) else { throw ExocortexError.toolNotAllowed }
        guard AntiUltronShield.accepts(payload: request.payload, maximumBytes: maxBytes) else {
            throw ExocortexError.invalidPayload
        }
    }
    /// Call only after the allowlisted tool has actually executed and returned this result.
    @discardableResult
    public func recordExecutedResult(_ request: ToolRequest, result: ToolExecutionResult) async throws -> EvidenceRecord {
        try validate(request)
        guard !result.propositionKey.isEmpty, !result.value.isEmpty, !result.provenance.isEmpty,
              result.value.utf8.count <= maxBytes else { throw ExocortexError.invalidPayload }
        let record = EvidenceRecord(
            propositionKey: result.propositionKey,
            value: result.value,
            source: .tool,
            provenance: result.provenance,
            observedAt: result.completedAt
        )
        try await journal.append(record)
        return record
    }
    public func evidenceSnapshot() async -> [EvidenceRecord] { await journal.snapshot() }
}
public struct EphemeralToolCompiler: Sendable {
    private let registry: ToolRegistry
    public init(registry: ToolRegistry) { self.registry = registry }
    public func compile(_ request: ToolRequest) throws -> ToolRequest {
        try registry.validate(request)
        return request
    }
}
// 8 Consent-gated sensor and trusted encrypted peer policies
public struct SensorConsent:Sendable,Equatable{public let vision:Bool;public let pencil:Bool;public let spatial:Bool;public init(vision:Bool=false,pencil:Bool=false,spatial:Bool=false){self.vision=vision;self.pencil=pencil;self.spatial=spatial}}
public protocol LocalTextRecognizer:Sendable{func recognizeText(from imageData:Data)async throws->String}
public struct ScreenVisionReader:Sendable{private let recognizer:any LocalTextRecognizer;public init(recognizer:any LocalTextRecognizer){self.recognizer=recognizer};public func extractText(from d:Data,consent:SensorConsent)async throws->String{guard consent.vision else{throw ExocortexError.memoryConsentRequired};return try await recognizer.recognizeText(from:d)}}
public struct SwarmPeerPolicy:Sendable{private let trusted:Set<String>;public init(trustedPeerIDs:Set<String>){trusted=trustedPeerIDs};public func accepts(peerID:String,encryptedTransport:Bool)->Bool{encryptedTransport && trusted.contains(peerID)}}
// 9 Whisper policy
public struct MetabolicWhisperPolicy:Sendable{public let minimumConfidence:Float;public init(minimumConfidence:Float=0.95){self.minimumConfidence=min(1,max(0,minimumConfidence))};public func shouldWhisper(confidence:Float?,userEnabled:Bool)->Bool{userEnabled && confidence.map{$0.isFinite && $0>=minimumConfidence && $0<=1} == true}}
// 10 Hyperdimensional vector operations; not premonition
public struct HyperdimensionalOracle:Sendable{
 public let bitCount:Int;public init(bitCount:Int=10_240){self.bitCount=max(64,(bitCount/64)*64)};public var wordCount:Int{bitCount/64}
 public func bind(_ a:[UInt64],_ b:[UInt64])throws->[UInt64]{guard a.count==wordCount,b.count==wordCount else{throw ExocortexError.dimensionMismatch};return zip(a,b).map(^)}
 public func similarity(_ a:[UInt64],_ b:[UInt64])throws->Double{let x=try bind(a,b);let n=x.reduce(0){$0+$1.nonzeroBitCount};return 1-Double(n)/Double(bitCount)}
}
// 11 Maximin and approximate fictitious play for zero-sum games
public struct GameTheoryStrategist:Sendable{
 public init(){}
 public func maximin(_ m:[[Double]])throws->(row:Int,guaranteedGain:Double){guard !m.isEmpty,let w=m.first?.count,w>0,m.allSatisfy({$0.count==w && $0.allSatisfy(\.isFinite)}) else{throw ExocortexError.invalidPayload};let v=m.map{$0.min()!};let i=v.indices.max{v[$0]<v[$1]}!;return(i,v[i])}
 public func approximateZeroSum(_ m:[[Double]],iterations:Int=2_000)throws->(rowMix:[Double],columnMix:[Double]){
  guard !m.isEmpty,let n=m.first?.count,n>0,m.allSatisfy({$0.count==n && $0.allSatisfy(\.isFinite)}),iterations>0 else{throw ExocortexError.invalidPayload}
  var rc=Array(repeating:0.0,count:m.count),cc=Array(repeating:0.0,count:n),rp=Array(repeating:0.0,count:m.count),cp=Array(repeating:0.0,count:n);var r=0,c=0
  for _ in 0..<iterations{rc[r]+=1;cc[c]+=1;for i in m.indices{rp[i]+=m[i][c]};for j in 0..<n{cp[j]-=m[r][j]};r=rp.indices.max{rp[$0]<rp[$1]}!;c=cp.indices.max{cp[$0]<cp[$1]}!}
  return(rc.map{$0/Double(iterations)},cc.map{$0/Double(iterations)})
 }
}
// 12 Ephemeral agents; clearing is best-effort, not physical RAM erasure
public final class EphemeralMicroAgent:@unchecked Sendable{
 public let specialty:String;private let lock=NSLock();private var weights:[Float]
 public init(specialty:String,size:Int=256){self.specialty=specialty;weights=Array(repeating:0,count:max(1,min(size,65_536)))}
 public func execute(_ input:[Float])throws->[Float]{lock.lock();defer{lock.unlock()};guard input.count==weights.count,input.allSatisfy(\.isFinite) else{throw ExocortexError.dimensionMismatch};return zip(input,weights).map(+)}
 public func clearBestEffort(){lock.lock();for i in weights.indices{weights[i]=0};weights.removeAll(keepingCapacity:false);lock.unlock()}
 deinit{clearBestEffort()}
}
// 13 Acoustic features only; no stress or fatigue diagnosis
public struct VoiceSignalFeatures:Sendable,Equatable{public let rms:Double;public let peak:Double;public let zeroCrossingRate:Double}
public enum VoiceBiometricMonitor{
 public static func analyze(_ s:[Float])throws->VoiceSignalFeatures{guard !s.isEmpty,s.allSatisfy(\.isFinite) else{throw ExocortexError.invalidVector};let rms=(s.reduce(0.0){$0+Double($1*$1)}/Double(s.count)).squareRoot();let peak=s.reduce(0.0){max($0,abs(Double($1)))};var crossings=0;if s.count>1{for i in 1..<s.count{let a=s[i-1],b=s[i];if(a<0 && b>=0)||(a>=0 && b<0){crossings+=1}}};return VoiceSignalFeatures(rms:rms,peak:peak,zeroCrossingRate:s.count>1 ? Double(crossings)/Double(s.count-1):0)}
}
// Pillars 1–2: model runtime contract and safe mapped adapter; no model bundled
public struct LocalModelDescriptor: Sendable, Equatable {
    public let identifier: String
    public let quantization: String
    public let maximumResidentBytes: Int
    public init(identifier: String, quantization: String, maximumResidentBytes: Int) {
        self.identifier = identifier
        self.quantization = quantization
        self.maximumResidentBytes = max(0, maximumResidentBytes)
    }
}
public struct LocalRuntimeObservation: Sendable, Equatable {
    public let status: String
    public let output: String?
    public let error: String?
    public let provenance: String
    public let observedAt: Date
    public init(status: String, output: String? = nil, error: String? = nil, provenance: String = "localRuntime", observedAt: Date = .now) {
        self.status = status
        self.output = output
        self.error = error
        self.provenance = provenance
        self.observedAt = observedAt
    }
}
public protocol LocalModelRuntime: Sendable {
    func load(_ descriptor: LocalModelDescriptor) async throws
    func infer(prompt: String, cycleBudget: Int) async throws -> String
}
/// Stable native bridge contract for a llama.cpp C-interop target supplied by the host app.
public protocol LlamaCppBackend: Sendable {
    func loadModel(at url: URL, contextTokens: Int) async throws
    func generate(prompt: String, maximumTokens: Int, shouldAbort: @escaping @Sendable () -> Bool) async throws -> String
    func unloadModel() async
}
public struct LlamaCppModelLocator: Sendable {
    public let modelURL: URL?
    public init(modelURL: URL?) { self.modelURL = modelURL }
}
public actor LlamaCppRuntimeAdapter: LocalModelRuntime {
    private let locator: LlamaCppModelLocator
    private let backend: any LlamaCppBackend
    private let safety: any RuntimeSafetyMonitoring
    private let minimumLoadMemoryBytes: Int64
    private let criticalMemoryBytes: Int64
    private var loaded = false
    private var descriptor: LocalModelDescriptor?
    public init(
        locator: LlamaCppModelLocator,
        backend: any LlamaCppBackend,
        safety: any RuntimeSafetyMonitoring = SystemRuntimeSafetyMonitor(),
        minimumLoadMemoryBytes: Int64 = 1_500_000_000,
        criticalMemoryBytes: Int64 = 512_000_000
    ) {
        self.locator = locator
        self.backend = backend
        self.safety = safety
        self.minimumLoadMemoryBytes = max(1, minimumLoadMemoryBytes)
        self.criticalMemoryBytes = max(1, criticalMemoryBytes)
    }
    public func load(_ descriptor: LocalModelDescriptor) async throws {
        if loaded { await emergencyUnload() }
        guard let modelURL = locator.modelURL, modelURL.isFileURL,
              modelURL.pathExtension.lowercased() == "gguf",
              FileManager.default.isReadableFile(atPath: modelURL.path) else {
            try await unloadAndRejectLoad(.modelNotLoaded)
        }
        guard descriptor.quantization.uppercased().contains("Q4") else {
            try await unloadAndRejectLoad(.invalidPayload)
        }
        let file: FileHandle
        do { file = try FileHandle(forReadingFrom: modelURL) }
        catch { throw ExocortexError.modelNotLoaded }
        let header = try file.read(upToCount: 4) ?? Data()
        try? file.close()
        guard header == Data("GGUF".utf8) else {
            try await unloadAndRejectLoad(.modelNotLoaded)
        }

        let state = safety.snapshot()
        guard state.thermalCondition == .nominal || state.thermalCondition == .fair else {
            try await unloadAndRejectLoad(.thermalLimit)
        }
        guard state.availableMemoryBytes >= 0 else {
            try await unloadAndRejectLoad(.memoryUnavailable)
        }
        guard ThermalGuardian.allowsInference(state, minimumMemoryBytes: max(minimumLoadMemoryBytes, Int64(descriptor.maximumResidentBytes) + criticalMemoryBytes)) else {
            try await unloadAndRejectLoad(.memoryPressure)
        }
        do {
            try await backend.loadModel(at: modelURL, contextTokens: ThermalGuardian.budget(for: state.thermalCondition).maximumContextTokens)
            self.descriptor = descriptor
            loaded = true
        } catch {
            await emergencyUnload()
            throw error
        }
    }
    private func unloadAndRejectLoad(_ error: ExocortexError) async throws -> Never {
        await emergencyUnload()
        throw error
    }
    public func infer(prompt: String, cycleBudget: Int) async throws -> String {
        guard loaded, descriptor != nil else { throw ExocortexError.modelNotLoaded }
        let before = safety.snapshot()
        if ThermalGuardian.shouldEmergencyUnload(before, criticalMemoryBytes: criticalMemoryBytes) {
            await emergencyUnload()
            throw before.thermalCondition == .critical || before.thermalCondition == .unknown
                ? ExocortexError.thermalLimit
                : (before.availableMemoryBytes < 0 ? ExocortexError.memoryUnavailable : ExocortexError.memoryPressure)
        }
        guard ThermalGuardian.allowsInference(before, minimumMemoryBytes: criticalMemoryBytes) else {
            await emergencyUnload()
            throw ExocortexError.memoryPressure
        }
        let budget = ThermalGuardian.budget(for: before.thermalCondition)
        let tokenLimit = min(budget.maximumContextTokens, max(128, cycleBudget * 128))
        let generated: String
        do {
            generated = try await backend.generate(prompt: prompt, maximumTokens: tokenLimit) { [safety, criticalMemoryBytes] in
                let current = safety.snapshot()
                return ThermalGuardian.shouldEmergencyUnload(current, criticalMemoryBytes: criticalMemoryBytes) ||
                    current.thermalCondition == .serious || current.thermalCondition == .unknown
            }
        } catch {
            let current = safety.snapshot()
            if ThermalGuardian.shouldEmergencyUnload(current, criticalMemoryBytes: criticalMemoryBytes) ||
                current.thermalCondition == .serious || current.thermalCondition == .unknown {
                await emergencyUnload()
                throw current.thermalCondition == .critical || current.thermalCondition == .serious || current.thermalCondition == .unknown
                    ? ExocortexError.thermalLimit
                    : (current.availableMemoryBytes < 0 ? ExocortexError.memoryUnavailable : ExocortexError.memoryPressure)
            }
            throw error
        }
        let after = safety.snapshot()
        if ThermalGuardian.shouldEmergencyUnload(after, criticalMemoryBytes: criticalMemoryBytes) ||
            after.thermalCondition == .serious || after.thermalCondition == .unknown {
            await emergencyUnload()
            throw after.thermalCondition == .critical || after.thermalCondition == .serious || after.thermalCondition == .unknown
                ? ExocortexError.thermalLimit
                : (after.availableMemoryBytes < 0 ? ExocortexError.memoryUnavailable : ExocortexError.memoryPressure)
        }
        return generated
    }
    public func emergencyUnload() async {
        await backend.unloadModel()
        loaded = false
        descriptor = nil
    }
}
/// CI-safe fallback: no model is fabricated and inference fails closed when the native bridge/model is absent.
public struct UnavailableLlamaCppBackend: LlamaCppBackend {
    public init() {}
    public func loadModel(at url: URL, contextTokens: Int) async throws { throw ExocortexError.runtimeUnavailable }
    public func generate(prompt: String, maximumTokens: Int, shouldAbort: @escaping @Sendable () -> Bool) async throws -> String { throw ExocortexError.runtimeUnavailable }
    public func unloadModel() async {}
}
public struct MappedLoRAAdapter:Sendable{public let data:Data;public init(contentsOf url:URL,maximumBytes:Int)throws{let d=try Data(contentsOf:url,options:.mappedIfSafe);guard d.count<=max(0,maximumBytes) else{throw ExocortexError.invalidPayload};data=d}}
