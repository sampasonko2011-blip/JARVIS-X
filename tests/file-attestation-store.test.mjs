import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFileAttestationLoader } from "../server/file-attestation-store.mjs";

test("loads only a JSON array from a server-local absolute file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jx-attestations-"));
  const path = resolve(join(dir, "attestations.json"));
  try {
    await writeFile(path, JSON.stringify([{ candidateId: "candidate-1", signature: "test" }]), { mode: 0o600 });
    const load = createFileAttestationLoader({ path });
    assert.deepEqual(await load(), [{ candidateId: "candidate-1", signature: "test" }]);
    await writeFile(path, JSON.stringify({ clientSupplied: true }), { mode: 0o600 });
    await assert.rejects(load, /ATTESTATION_STORE_ARRAY_REQUIRED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects relative paths and oversized evidence files", async () => {
  assert.throws(() => createFileAttestationLoader({ path: "attestations.json" }), /ATTESTATION_STORE_PATH_MUST_BE_ABSOLUTE/);
  const dir = await mkdtemp(join(tmpdir(), "jx-attestations-"));
  const path = resolve(join(dir, "attestations.json"));
  try {
    await writeFile(path, JSON.stringify([]), { mode: 0o600 });
    const load = createFileAttestationLoader({ path, maxBytes: 1 });
    await assert.rejects(load, /ATTESTATION_STORE_INVALID/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
