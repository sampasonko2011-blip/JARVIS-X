import Foundation
#if canImport(Metal)
import Metal
#endif

public protocol TensorBackingStore: Sendable {
    var capacity: Int { get }
    var dimension: Int { get }
    func write(_ values: [Float], slot: Int) throws
    func read(slot: Int) throws -> [Float]
    func clear(slot: Int) throws
}
public struct TensorSlotLease: Hashable, Sendable {
    public let slot: Int
    fileprivate let id: UUID
    fileprivate init(slot: Int) { self.slot = slot; self.id = UUID() }
}
public final class CPUTensorStore: TensorBackingStore, @unchecked Sendable {
    public let capacity: Int; public let dimension: Int
    private let lock = NSLock(); private var storage: [[Float]]
    public init(capacity: Int = 64, dimension: Int = 512) throws {
        guard capacity > 0, dimension > 0 else { throw ExocortexError.invalidDimension }
        self.capacity=capacity; self.dimension=dimension
        storage=Array(repeating:Array(repeating:0,count:dimension),count:capacity)
    }
    public func write(_ values:[Float],slot:Int)throws {
        guard slot>=0 && slot<capacity else{throw ExocortexError.invalidPayload}
        guard values.count==dimension else{throw ExocortexError.dimensionMismatch}
        guard values.allSatisfy(\.isFinite) else{throw ExocortexError.invalidVector}
        lock.lock();defer{lock.unlock()};storage[slot]=values
    }
    public func read(slot:Int)throws->[Float] {
        guard slot>=0 && slot<capacity else{throw ExocortexError.invalidPayload}
        lock.lock();defer{lock.unlock()};return storage[slot]
    }
    public func clear(slot:Int)throws {
        guard slot>=0 && slot<capacity else{throw ExocortexError.invalidPayload}
        lock.lock();defer{lock.unlock()};storage[slot]=Array(repeating:0,count:dimension)
    }
}
public enum TensorStoreFactory {
    public static func make(capacity:Int=64,dimension:Int=512,preferMetal:Bool=true)throws->any TensorBackingStore {
        #if canImport(Metal)
        if preferMetal,let metal=try? MetalSharedTensorStore(capacity:capacity,dimension:dimension){return metal}
        #endif
        return try CPUTensorStore(capacity:capacity,dimension:dimension)
    }
}
#if canImport(Metal)
/// MTLBuffer CPU/GPU shared storage; does not imply Neural Engine or end-to-end zero-copy.
public final class MetalSharedTensorStore: TensorBackingStore, @unchecked Sendable {
    public let capacity:Int;public let dimension:Int
    private let lock=NSLock();private let buffer:MTLBuffer
    public init(capacity:Int=64,dimension:Int=512,device:MTLDevice?=MTLCreateSystemDefaultDevice())throws {
        guard capacity>0,dimension>0,let device else{throw ExocortexError.runtimeUnavailable}
        let count=capacity.multipliedReportingOverflow(by:dimension)
        guard !count.overflow else{throw ExocortexError.invalidDimension}
        let bytes=count.partialValue.multipliedReportingOverflow(by:MemoryLayout<Float>.stride)
        guard !bytes.overflow,let buffer=device.makeBuffer(length:bytes.partialValue,options:.storageModeShared) else{throw ExocortexError.runtimeUnavailable}
        self.capacity=capacity;self.dimension=dimension;self.buffer=buffer
    }
    private func range(_ slot:Int)throws->Range<Int>{
        guard slot>=0 && slot<capacity else{throw ExocortexError.invalidPayload}
        return (slot*dimension)..<((slot+1)*dimension)
    }
    public func write(_ values:[Float],slot:Int)throws{
        let r=try range(slot);guard values.count==dimension else{throw ExocortexError.dimensionMismatch}
        guard values.allSatisfy(\.isFinite) else{throw ExocortexError.invalidVector}
        lock.lock();defer{lock.unlock()}
        let p=buffer.contents().bindMemory(to:Float.self,capacity:capacity*dimension)
        for (i,v) in values.enumerated(){p[r.lowerBound+i]=v}
    }
    public func read(slot:Int)throws->[Float]{
        let r=try range(slot);lock.lock();defer{lock.unlock()}
        let p=buffer.contents().bindMemory(to:Float.self,capacity:capacity*dimension)
        return Array(UnsafeBufferPointer(start:p.advanced(by:r.lowerBound),count:dimension))
    }
    public func clear(slot:Int)throws{
        let r=try range(slot);lock.lock();defer{lock.unlock()}
        let p=buffer.contents().bindMemory(to:Float.self,capacity:capacity*dimension)
        for i in r{p[i]=0}
    }
}
#endif
