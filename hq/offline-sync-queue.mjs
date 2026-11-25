/**
 * P5 OfflineSyncQueue — durable, local-only mutation outbox.
 * Payloads remain plaintext in this origin's IndexedDB. This module does not
 * claim encryption, account sync, or a configured remote transport.
 */
const DB_NAME = "jarvis-x-p5";
const DB_VERSION = 1;
const STORE = "outbox";
const MAX_PAYLOAD_BYTES = 256 * 1024;
const now = () => Date.now();
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `jx-${now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export class OfflineSyncQueue {
  constructor({ indexedDB = globalThis.indexedDB, isOnline = () => globalThis.navigator?.onLine !== false, clock = now } = {}) {
    if (!indexedDB) throw new Error("INDEXEDDB_UNAVAILABLE");
    this.indexedDB = indexedDB;
    this.isOnline = isOnline;
    this.clock = clock;
    this.dbPromise = null;
  }

  async open() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: "id" });
            store.createIndex("status_createdAt", ["status", "createdAt"], { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
        request.onblocked = () => reject(new Error("INDEXEDDB_OPEN_BLOCKED"));
      });
    }
    return this.dbPromise;
  }

  async enqueue({ type, payload, idempotencyKey = makeId(), metadata = {} }) {
    if (!/^[a-z][a-z0-9._-]{1,63}$/i.test(String(type ?? ""))) throw new TypeError("INVALID_MUTATION_TYPE");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("PAYLOAD_MUST_BE_OBJECT");
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES) throw new RangeError("PAYLOAD_TOO_LARGE");
    if (!/^[\w:.-]{8,160}$/.test(String(idempotencyKey))) throw new TypeError("INVALID_IDEMPOTENCY_KEY");
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const existing = await requestResult(store.index("status_createdAt").getAll());
    const duplicate = existing.find((item) => item.idempotencyKey === idempotencyKey);
    if (duplicate) { await transactionDone(tx); return { ...duplicate, duplicate: true }; }
    const record = {
      id: makeId(), idempotencyKey, type: String(type), payload: JSON.parse(serialized),
      metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
      status: "pending", attempts: 0, createdAt: this.clock(), updatedAt: this.clock(), lastError: null,
    };
    store.add(record);
    await transactionDone(tx);
    return { ...record, duplicate: false };
  }

  async list() {
    const db = await this.open();
    const tx = db.transaction(STORE, "readonly");
    const records = await requestResult(tx.objectStore(STORE).getAll());
    await transactionDone(tx);
    return records.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }

  async recoverInterrupted() {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const records = await requestResult(store.getAll());
    for (const record of records) {
      if (record.status === "sending") {
        record.status = "pending";
        record.updatedAt = this.clock();
        record.lastError = "RECOVERED_AFTER_INTERRUPTED_ATTEMPT";
        store.put(record);
      }
    }
    await transactionDone(tx);
    return records.filter((item) => item.status === "sending").length;
  }

  async flush({ send, limit = 10 } = {}) {
    if (typeof send !== "function") throw new TypeError("EXPLICIT_TRANSPORT_REQUIRED");
    if (!this.isOnline()) return { status: "OFFLINE", sent: 0, failed: 0 };
    const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const candidates = (await this.list()).filter((item) => item.status === "pending").slice(0, boundedLimit);
    let sent = 0, failed = 0;
    for (const item of candidates) {
      if (!this.isOnline()) break;
      await this.#update(item.id, (current) => ({ ...current, status: "sending", attempts: current.attempts + 1, updatedAt: this.clock() }));
      try {
        await send({ type: item.type, payload: item.payload, idempotencyKey: item.idempotencyKey, metadata: item.metadata });
        await this.#update(item.id, (current) => ({ ...current, status: "synced", updatedAt: this.clock(), lastError: null }));
        sent++;
      } catch (error) {
        await this.#update(item.id, (current) => ({ ...current, status: "pending", updatedAt: this.clock(), lastError: String(error?.code ?? error?.message ?? "TRANSPORT_FAILED").slice(0, 240) }));
        failed++;
      }
    }
    return { status: failed ? "PARTIAL" : "COMPLETE", sent, failed };
  }

  async #update(id, update) {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const current = await requestResult(store.get(id));
    if (current) store.put(update(current));
    await transactionDone(tx);
  }
}
export const OFFLINE_QUEUE_CONTRACT = Object.freeze({
  storage: "IndexedDB",
  encryptedAtRest: false,
  automaticRemoteSync: false,
  transport: "injected explicitly by caller",
  idempotency: "stable idempotencyKey passed unchanged to transport",
  maxPayloadBytes: MAX_PAYLOAD_BYTES,
});
