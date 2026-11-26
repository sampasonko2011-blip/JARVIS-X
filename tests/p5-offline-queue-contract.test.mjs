import test from "node:test";
import assert from "node:assert/strict";
import { OfflineSyncQueue, OFFLINE_QUEUE_CONTRACT, encryptQueuePayload, decryptQueuePayload, createDeterministicIdempotencyKey } from "../hq/offline-sync-queue.mjs";

test("queue is IndexedDB-backed, AES-GCM encrypted at rest, and not remotely synced by default", () => {
  assert.equal(OFFLINE_QUEUE_CONTRACT.storage,"IndexedDB");
  assert.equal(OFFLINE_QUEUE_CONTRACT.encryptedAtRest,true);
  assert.equal(OFFLINE_QUEUE_CONTRACT.encryption,"AES-GCM-256");
  assert.equal(OFFLINE_QUEUE_CONTRACT.automaticRemoteSync,false);
  assert.match(OFFLINE_QUEUE_CONTRACT.remoteDeliverySemantics,/delivery_unknown/);
  assert.equal(OFFLINE_QUEUE_CONTRACT.automaticRemoteSync,false);
  assert.equal(OFFLINE_QUEUE_CONTRACT.transport,"injected explicitly by caller");
});
test("queue refuses to pretend storage exists when IndexedDB is unavailable", () => {
  assert.throws(()=>new OfflineSyncQueue({indexedDB:null}),/INDEXEDDB_UNAVAILABLE/);
});
test("queue requires an explicit transport and rejects offline flush", async () => {
  const fake = {open(){throw new Error("should not open")}};
  const queue = Object.create(OfflineSyncQueue.prototype);
  queue.isOnline=()=>false;
  assert.deepEqual(await queue.flush({send:async()=>{},limit:1}),{status:"OFFLINE",sent:0,failed:0});
  await assert.rejects(()=>queue.flush(),/EXPLICIT_TRANSPORT_REQUIRED/);
});

test("AES-GCM queue payloads are ciphertext at rest and decrypt only with the non-exportable key", async () => {
  const key = await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  assert.equal(key.extractable, false);
  const payload = { title: "private fixture", body: "should not be stored as cleartext" };
  const sealed = await encryptQueuePayload(payload, key);
  const storedBytes = new TextDecoder().decode(sealed.payloadCiphertext);
  assert.equal(storedBytes.includes(payload.body), false);
  assert.deepEqual(await decryptQueuePayload(sealed, key), payload);
  const otherKey = await globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await assert.rejects(() => decryptQueuePayload(sealed, otherKey));
});

test("deterministic idempotency key binds canonical mutation content and causal HLC", async () => {
  const payload = { z: 2, a: { y: true, x: 1 } };
  const causalClock = { wall: 1234, logical: 2, actor: "ipad" };
  const first = await createDeterministicIdempotencyKey({ type: "memory.note.crdt", payload, causalClock });
  const reordered = await createDeterministicIdempotencyKey({ type: "memory.note.crdt", payload: { a: { x: 1, y: true }, z: 2 }, causalClock });
  const changedClock = await createDeterministicIdempotencyKey({ type: "memory.note.crdt", payload, causalClock: { ...causalClock, logical: 3 } });
  assert.match(first, /^jx-sha256-[a-f0-9]{64}$/);
  assert.equal(first, reordered);
  assert.notEqual(first, changedClock);
});
