/**
 * P5 OfflineSyncQueue — encrypted, local-only mutation outbox.
 * AES-GCM payloads use a non-extractable CryptoKey persisted by IndexedDB.
 * This protects database exports at rest, but not same-origin script compromise.
 * No remote transport is configured or invoked by this module.
 */
const DB_NAME = "jarvis-x-p5";
const DB_VERSION = 3;
const STORE = "outbox";
const KEY_STORE = "crypto_keys";
const KEY_ID = "payload-aes-gcm-v1";
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
function cryptoApi() {
  const api = globalThis.crypto;
  if (!api?.subtle || typeof api.getRandomValues !== "function") throw new Error("WEBCRYPTO_UNAVAILABLE");
  return api;
}
export async function encryptQueuePayload(payload, key, crypto = cryptoApi()) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { payloadIv: iv.buffer, payloadCiphertext: ciphertext };
}
export async function decryptQueuePayload(record, key, crypto = cryptoApi()) {
  if (!record?.payloadCiphertext || !record?.payloadIv) throw new Error("QUEUE_CIPHERTEXT_MISSING");
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.payloadIv) }, key, record.payloadCiphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (error) {
    throw new Error("QUEUE_KEY_CORRUPTED_OR_CIPHERTEXT_TAMPERED", { cause: error });
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export async function createDeterministicIdempotencyKey({ type, payload, causalClock = null, crypto = cryptoApi() }) {
  if (typeof type !== "string" || !type) throw new TypeError("IDEMPOTENCY_TYPE_REQUIRED");
  const canonical = stableJson({ type, payload, causalClock });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `jx-sha256-${hex}`;
}

export class OfflineSyncQueue {
  constructor({ indexedDB = globalThis.indexedDB, isOnline = () => globalThis.navigator?.onLine !== false, clock = now, crypto = cryptoApi() } = {}) {
    if (!indexedDB) throw new Error("INDEXEDDB_UNAVAILABLE");
    this.indexedDB = indexedDB;
    this.isOnline = isOnline;
    this.clock = clock;
    this.crypto = crypto;
    this.dbPromise = null;
    this.keyPromise = null;
  }

  async open() {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          const tx = request.transaction;
          const store = db.objectStoreNames.contains(STORE) ? tx.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: "id" });
          if (!store.indexNames.contains("status_createdAt")) store.createIndex("status_createdAt", ["status", "createdAt"], { unique: false });
          if (!store.indexNames.contains("idempotencyKey")) store.createIndex("idempotencyKey", "idempotencyKey", { unique: true });
          if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("INDEXEDDB_OPEN_FAILED"));
        request.onblocked = () => reject(new Error("INDEXEDDB_OPEN_BLOCKED"));
      });
    }
    return this.dbPromise;
  }

  async #key() {
    if (!this.keyPromise) {
      this.keyPromise = (async () => {
        const db = await this.open();
        const tx = db.transaction([KEY_STORE, STORE], "readwrite");
        const done = transactionDone(tx);
        const keyStore = tx.objectStore(KEY_STORE);
        const outboxStore = tx.objectStore(STORE);
        const [keyRow, records] = await Promise.all([
          requestResult(keyStore.get(KEY_ID)),
          requestResult(outboxStore.getAll())
        ]);
        let selected = keyRow?.key;
        if (!selected) {
          // Never silently replace a missing key while encrypted records still exist.
          const hasCiphertext = records.some((record) => record?.payloadCiphertext && record?.payloadIv);
          if (hasCiphertext) {
            await done;
            throw new Error("QUEUE_KEY_LOST");
          }
          selected = await this.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
          );
          keyStore.add({ id: KEY_ID, key: selected, algorithm: "AES-GCM", extractable: false, createdAt: this.clock() });
        }
        await done;
        if (!selected || selected.type !== "secret" || selected.algorithm?.name !== "AES-GCM" ||
            selected.algorithm?.length !== 256 || selected.extractable !== false ||
            !selected.usages?.includes("encrypt") || !selected.usages?.includes("decrypt")) {
          throw new Error("QUEUE_KEY_CORRUPTED");
        }
        return selected;
      })().catch((error) => {
        this.keyPromise = null;
        if (/QUEUE_KEY_(LOST|CORRUPTED|UNAVAILABLE)/.test(String(error?.message))) throw error;
        throw new Error("QUEUE_KEY_UNAVAILABLE", { cause: error });
      });
    }
    return this.keyPromise;
  }

  async #seal(payload) {
    const key = await this.#key();
    return encryptQueuePayload(payload, key, this.crypto);
  }
  async #openPayload(record) {
    if (Object.hasOwn(record, "payload")) {
      // One-time lazy migration of records written by the pre-encryption queue.
      const sealed = await this.#seal(record.payload);
      const db = await this.open();
      const tx = db.transaction(STORE, "readwrite");
      const done = transactionDone(tx);
      const current = await requestResult(tx.objectStore(STORE).get(record.id));
      if (current && Object.hasOwn(current, "payload")) {
        delete current.payload;
        Object.assign(current, sealed);
        tx.objectStore(STORE).put(current);
      }
      await done;
      return JSON.parse(new TextDecoder().decode(await this.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(sealed.payloadIv) }, await this.#key(), sealed.payloadCiphertext
      )));
    }
    return decryptQueuePayload(record, await this.#key(), this.crypto);
  }
  async #present(record) {
    return { ...record, payload: await this.#openPayload(record), encrypted: true };
  }

  async enqueue({ type, payload, idempotencyKey = makeId(), metadata = {} }) {
    if (!/^[a-z][a-z0-9._-]{1,63}$/i.test(String(type ?? ""))) throw new TypeError("INVALID_MUTATION_TYPE");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("PAYLOAD_MUST_BE_OBJECT");
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES) throw new RangeError("PAYLOAD_TOO_LARGE");
    if (!/^[\w:.-]{8,160}$/.test(String(idempotencyKey))) throw new TypeError("INVALID_IDEMPOTENCY_KEY");
    const sealed = await this.#seal(JSON.parse(serialized));
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore(STORE);
    const duplicate = await requestResult(store.index("idempotencyKey").get(idempotencyKey));
    if (duplicate) { await done; return { ...(await this.#present(duplicate)), duplicate: true }; }
    const record = {
      id: makeId(), idempotencyKey, type: String(type), ...sealed,
      metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
      status: "pending", attempts: 0, createdAt: this.clock(), updatedAt: this.clock(), lastError: null,
    };
    store.add(record);
    await done;
    return { ...(await this.#present(record)), duplicate: false };
  }

  async list() {
    const db = await this.open();
    const tx = db.transaction(STORE, "readonly");
    const done = transactionDone(tx);
    const records = await requestResult(tx.objectStore(STORE).getAll());
    await done;
    const sorted = records.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const presented = [];
    for (const record of sorted) presented.push(await this.#present(record));
    return presented;
  }

  async recoverInterrupted() {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore(STORE);
    const records = await requestResult(store.getAll());
    for (const record of records) {
      if (record.status === "sending") {
        record.status = "delivery_unknown";
        record.updatedAt = this.clock();
        record.lastError = "DELIVERY_UNKNOWN_AFTER_INTERRUPTED_ATTEMPT";
        store.put(record);
      }
    }
    await done;
    return records.filter((item) => item.status === "sending").length;
  }

  async retryUncertain(id) {
    return await this.#update(id, (current) => current.status === "delivery_unknown"
      ? { ...current, status: "pending", updatedAt: this.clock(), lastError: null }
      : current, { requireStatus: "delivery_unknown" });
  }

  async flush({ send, limit = 10 } = {}) {
    if (typeof send !== "function") throw new TypeError("EXPLICIT_TRANSPORT_REQUIRED");
    if (!this.isOnline()) return { status: "OFFLINE", sent: 0, failed: 0 };
    const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const candidates = (await this.list()).filter((item) => item.status === "pending").slice(0, boundedLimit);
    let sent = 0, failed = 0;
    for (const item of candidates) {
      if (!this.isOnline()) break;
      const claimed = await this.#update(item.id, (current) => current.status === "pending"
        ? { ...current, status: "sending", attempts: current.attempts + 1, updatedAt: this.clock() }
        : current, { requirePending: true });
      if (!claimed) continue;
      try {
        await send({ type: item.type, payload: item.payload, idempotencyKey: item.idempotencyKey, metadata: item.metadata });
        await this.#update(item.id, (current) => ({ ...current, status: "synced", updatedAt: this.clock(), lastError: null }));
        sent++;
      } catch (error) {
        const uncertain = error?.deliveryUnknown === true;
        await this.#update(item.id, (current) => ({ ...current, status: uncertain ? "delivery_unknown" : "pending", updatedAt: this.clock(), lastError: String(error?.code ?? error?.message ?? "TRANSPORT_FAILED").slice(0, 240) }));
        failed++;
      }
    }
    return { status: failed ? "PARTIAL" : "COMPLETE", sent, failed };
  }

  async #update(id, update, { requirePending = false, requireStatus = null } = {}) {
    const db = await this.open();
    const tx = db.transaction(STORE, "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore(STORE);
    const current = await requestResult(store.get(id));
    const claimed = Boolean(current && (!requirePending || current.status === "pending") && (!requireStatus || current.status === requireStatus));
    if (claimed) store.put(update(current));
    await done;
    return claimed;
  }
}
export const OFFLINE_QUEUE_CONTRACT = Object.freeze({
  storage: "IndexedDB",
  encryption: "AES-GCM-256",
  encryptedAtRest: true,
  key: "non-extractable CryptoKey persisted in same origin IndexedDB",
  threatBoundary: "protects database exports at rest; not same-origin script compromise",
  automaticRemoteSync: false,
  transport: "injected explicitly by caller",
  idempotency: "stable local idempotencyKey passed to transport; remote dedupe is not guaranteed",
  remoteDeliverySemantics: "manual at-least-once; ambiguous deliveries are quarantined as delivery_unknown",
  maxPayloadBytes: MAX_PAYLOAD_BYTES,
});
