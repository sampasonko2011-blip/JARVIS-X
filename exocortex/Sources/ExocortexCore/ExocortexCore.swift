import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum ExocortexError: Error, Equatable, Sendable { case invalidDimension, dimensionMismatch, invalidVector, memoryConsentRequired, invalidEndpoint, invalidResponse, httpStatus(Int), toolNotAllowed, invalidPayload, contextualEngineRequired, validationRejected }
public struct VectorMessage: Codable, Equatable, Sendable {
 public let id:UUID; public let source:String; public let values:[Float]; public let createdAt:Date
 public init(id:UUID=UUID(),source:String,values:[Float],createdAt:Date = .now){self.id=id;self.source=source;self.values=values;self.createdAt=createdAt}
}
// 1 NeuralBus
public actor NeuralBus {
 private let dimension:Int;private let capacity:Int;private var messages:[VectorMessage]=[]
 public init(dimension:Int=512,capacity:Int=64)throws{guard dimension>0,capacity>0 else{throw ExocortexError.invalidDimension};self.dimension=dimension;self.capacity=capacity}
 public func publish(_ message:VectorMessage)throws{guard message.values.count==dimension else{throw ExocortexError.dimensionMismatch};guard message.values.allSatisfy(\.isFinite) else{throw ExocortexError.invalidVector};messages.append(message);if messages.count>capacity{messages.removeFirst(messages.count-capacity)}}
 public func latest(limit:Int=16)->[VectorMessage]{Array(messages.suffix(max(0,min(limit,capacity))))}
 public func clear(){messages.removeAll(keepingCapacity:false)}
}
// 2 ThermalGuardian
public enum ThermalCondition:Sendable{case nominal,fair,serious,critical,unknown}
public struct ThermalBudget:Equatable,Sendable{public let reasoningCycles:Int;public let maxConcurrentAgents:Int;public let permitsEvolution:Bool}
public enum ThermalGuardian{
 public static func budget(for c:ThermalCondition)->ThermalBudget{switch c{case .nominal:ThermalBudget(reasoningCycles:12,maxConcurrentAgents:2,permitsEvolution:true);case .fair:ThermalBudget(reasoningCycles:6,maxConcurrentAgents:1,permitsEvolution:false);case .serious,.critical,.unknown:ThermalBudget(reasoningCycles:1,maxConcurrentAgents:1,permitsEvolution:false)}}
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
                (cited.isEmpty || cited.contains($0.id))
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
    public init(memoryRecall: MemoryRecall? = nil, memoryEvidence: [EvidenceRecord] = [], workingSetEvidence: [EvidenceRecord] = [], toolEvidence: [EvidenceRecord] = [], evidence: [EvidenceRecord] = [], claims: [EvidenceClaim] = []) {
        self.memoryRecall = memoryRecall
        self.memoryEvidence = memoryEvidence
        self.workingSetEvidence = workingSetEvidence
        self.toolEvidence = toolEvidence
        self.evidence = evidence
        self.claims = claims
    }
    /// Raw XMemo text is context, not proof. Only structured, provenance-bearing records enter the ledger.
    public var allEvidence: [EvidenceRecord] { evidence + memoryEvidence + workingSetEvidence + toolEvidence }
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
        var normalized = gatewayURL
        if !normalized.path.hasSuffix("/") { normalized.append(path: "/") }
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
public actor EphemeralWorkingSet{
 private struct Entry:Sendable{let vector:[Float];let expiry:Date}
 private var entries:[UUID:Entry]=[:];private let ttl:TimeInterval;private let capacity:Int
 public init(ttl:TimeInterval=172_800,capacity:Int=128){self.ttl=max(1,ttl);self.capacity=max(1,capacity)}
 public func store(_ v:[Float],now:Date = .now)throws->UUID{guard !v.isEmpty,v.allSatisfy(\.isFinite) else{throw ExocortexError.invalidVector};purge(now);if entries.count>=capacity,let key=entries.min(by:{$0.value.expiry<$1.value.expiry})?.key{entries.removeValue(forKey:key)};let id=UUID();entries[id]=Entry(vector:v,expiry:now.addingTimeInterval(ttl));return id}
 public func nearest(to q:[Float],now:Date = .now)throws->[Float]?{guard !q.isEmpty,q.allSatisfy(\.isFinite) else{throw ExocortexError.invalidVector};purge(now);return entries.values.filter{$0.vector.count==q.count}.max{cosine($0.vector,q)<cosine($1.vector,q)}?.vector}
 public func count(now:Date = .now)->Int{purge(now);return entries.count}
 public func clear(){entries.removeAll(keepingCapacity:false)}
 private func purge(_ now:Date){entries=entries.filter{$0.value.expiry>now}}
 private func cosine(_ a:[Float],_ b:[Float])->Float{let d=zip(a,b).reduce(Float.zero){$0+$1.0*$1.1};let aa=a.reduce(Float.zero){$0+$1*$1};let bb=b.reduce(Float.zero){$0+$1*$1};guard aa>0,bb>0 else{return 0};return d/(aa.squareRoot()*bb.squareRoot())}
}
// 4 Cognitive agents, Saboteur and bounded security
public protocol CognitiveAgent:Sendable{var name:String{get};func process(_ input:[Float])async throws->[Float]}
public struct SaboteurAgent:Sendable{
 public let minimumConfidence:Float;public init(minimumConfidence:Float=0.70){self.minimumConfidence=min(1,max(0,minimumConfidence))}
 public func validate(output:[Float],confidence:Float?)->Bool{guard !output.isEmpty,output.allSatisfy(\.isFinite),let c=confidence,c.isFinite else{return false};return c>=minimumConfidence && c<=1}
}
public enum AntiUltronShield{public static func accepts(payload:Data,maximumBytes:Int=65_536)->Bool{payload.count<=max(0,maximumBytes)}}
// 5 Orchestrator uses an injected actual reasoning runtime
public struct ReasoningResult:Sendable,Equatable{public let output:[Float];public let confidence:Float?;public init(output:[Float],confidence:Float?){self.output=output;self.confidence=confidence}}
public protocol ReasoningEngine:Sendable{func reason(input:[Float],cycleBudget:Int)async throws->ReasoningResult}
public struct OrchestrationDecision:Sendable,Equatable{public let approved:Bool;public let confidence:Float?;public let output:[Float];public let reason:String}
public struct ExocortexOrchestrator:Sendable{
 private let engine:any ReasoningEngine;private let saboteur:SaboteurAgent
 public init(engine:any ReasoningEngine,saboteur:SaboteurAgent=SaboteurAgent()){self.engine=engine;self.saboteur=saboteur}
 public func think(seed:[Float],budget:ThermalBudget)async throws->OrchestrationDecision{guard !seed.isEmpty,seed.allSatisfy(\.isFinite) else{throw ExocortexError.invalidVector};let r=try await engine.reason(input:seed,cycleBudget:budget.reasoningCycles);let ok=saboteur.validate(output:r.output,confidence:r.confidence);return OrchestrationDecision(approved:ok,confidence:r.confidence,output:ok ? r.output:[],reason:ok ? "validated_by_configured_policy":"confidence_or_output_not_validated")}
}
// 6 Evolution and background scheduling contract
public struct CandidateScore:Sendable,Equatable{public let candidateID:String;public let heldOutScore:Double;public init(candidateID:String,heldOutScore:Double){self.candidateID=candidateID;self.heldOutScore=heldOutScore}}
public struct EvolutionArena:Sendable{public init(){};public func champion(from s:[CandidateScore],minimumScore:Double)->CandidateScore?{guard s.allSatisfy({$0.heldOutScore.isFinite}) else{return nil};return s.filter{$0.heldOutScore>=minimumScore}.max{$0.heldOutScore<$1.heldOutScore}}
}
public protocol BackgroundEvolutionScheduling:Sendable{func submitRequiresExternalPower()async throws}
// 7 Allowlisted tools; arbitrary JavaScript is not considered sandboxed
public struct ToolRequest:Sendable,Equatable{public let name:String;public let payload:Data;public init(name:String,payload:Data){self.name=name;self.payload=payload}}
public struct ToolRegistry:Sendable{
 private let names:Set<String>;private let maxBytes:Int
 public init(allowedNames:Set<String>,maximumPayloadBytes:Int=65_536){names=allowedNames;maxBytes=max(0,maximumPayloadBytes)}
 public func validate(_ r:ToolRequest)throws{guard names.contains(r.name) else{throw ExocortexError.toolNotAllowed};guard AntiUltronShield.accepts(payload:r.payload,maximumBytes:maxBytes) else{throw ExocortexError.invalidPayload}}
}
public struct EphemeralToolCompiler:Sendable{private let registry:ToolRegistry;public init(registry:ToolRegistry){self.registry=registry};public func compile(_ r:ToolRequest)throws->ToolRequest{try registry.validate(r);return r}}
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
public struct LocalModelDescriptor:Sendable,Equatable{public let identifier:String;public let quantization:String;public let maximumResidentBytes:Int;public init(identifier:String,quantization:String,maximumResidentBytes:Int){self.identifier=identifier;self.quantization=quantization;self.maximumResidentBytes=max(0,maximumResidentBytes)}}
public protocol LocalModelRuntime:Sendable{func load(_ descriptor:LocalModelDescriptor)async throws;func infer(prompt:String,cycleBudget:Int)async throws->String}
public struct MappedLoRAAdapter:Sendable{public let data:Data;public init(contentsOf url:URL,maximumBytes:Int)throws{let d=try Data(contentsOf:url,options:.mappedIfSafe);guard d.count<=max(0,maximumBytes) else{throw ExocortexError.invalidPayload};data=d}}
