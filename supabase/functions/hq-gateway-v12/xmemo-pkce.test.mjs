import test from "node:test";
import assert from "node:assert/strict";
import { createPkceAuthorizationMaterial } from "./xmemo-pkce.mjs";

test("creates RFC 7636 S256 material with independent state", async () => {
  const a = await createPkceAuthorizationMaterial();
  const b = await createPkceAuthorizationMaterial();
  assert.equal(a.method, "S256");
  assert.match(a.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(a.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(a.state, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.verifier, a.state);
  assert.notEqual(a.verifier, b.verifier);
  assert.notEqual(a.state, b.state);
});

test("fails closed when WebCrypto is unavailable", async () => {
  await assert.rejects(createPkceAuthorizationMaterial({ cryptoImpl: {} }), /pkce_webcrypto_unavailable/);
});
