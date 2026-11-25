import test from "node:test";
import assert from "node:assert/strict";
import { OfflineSyncQueue, OFFLINE_QUEUE_CONTRACT } from "../hq/offline-sync-queue.mjs";

test("queue is IndexedDB-backed and explicitly not encrypted or remotely synced by default", () => {
  assert.equal(OFFLINE_QUEUE_CONTRACT.storage,"IndexedDB");
  assert.equal(OFFLINE_QUEUE_CONTRACT.encryptedAtRest,false);
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
