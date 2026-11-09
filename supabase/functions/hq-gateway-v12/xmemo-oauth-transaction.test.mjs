import test from "node:test";
import assert from "node:assert/strict";
import { createXMemoOAuthTransactionCoordinator } from "./xmemo-oauth-transaction.mjs";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CALLBACK = "https://hq.example.test/auth/xmemo/callback";
function fixture() {
  let time = 1_800_000_000_000;
  let counter = 0;
  const rows = new Map();
  const credentials = [];
  const coordinator = createXMemoOAuthTransactionCoordinator({
    now: () => time,
    randomBytes: (length) => {
      counter += 1;
      return new Uint8Array(length).fill(counter);
    },
    cryptoBox: {
      async seal(userId, value) { return userId + ":" + value; },
      async open(userId, value) {
        assert.ok(value.startsWith(userId + ":"));
        return value.slice(userId.length + 1);
      },
    },
    transactionStore: {
      async insert(row) {
        assert.ok(!rows.has(row.state_hash), "state hash must be unique");
        rows.set(row.state_hash, row);
      },
      async consume({ state_hash, user_id, now }) {
        const row = rows.get(state_hash);
        if (!row || row.user_id !== user_id || Date.parse(row.expires_at) <= Date.parse(now)) return null;
        rows.delete(state_hash);
        return row;
      },
    },
    credentialStore: {
      async saveEncrypted(row) { credentials.push(row); },
    },
    async exchangeCode(input) {
      assert.equal(input.resource, "https://xmemo.dev/mcp");
      assert.equal(input.verifier.length, 43);
      return { accessToken: "access-test", refreshToken: "refresh-test", expiresIn: 3600 };
    },
  });
  return { coordinator, rows, credentials, advance(ms) { time += ms; } };
}

test("begin stores a user-bound encrypted verifier and returns S256 challenge", async () => {
  const f = fixture();
  const result = await f.coordinator.begin({ userId: USER, clientId: "public-client", redirectUri: CALLBACK });
  assert.equal(result.codeChallengeMethod, "S256");
  assert.equal(result.state.length, 43);
  assert.equal(result.codeChallenge.length, 43);
  const row = [...f.rows.values()][0];
  assert.equal(row.user_id, USER);
  assert.ok(row.encrypted_code_verifier.startsWith(USER + ":"));
  assert.equal(row.redirect_uri, CALLBACK);
});

test("complete consumes state once and persists tokens without returning them", async () => {
  const f = fixture();
  const started = await f.coordinator.begin({ userId: USER, clientId: "public-client", redirectUri: CALLBACK });
  const result = await f.coordinator.complete({ userId: USER, state: started.state, code: "one-time-code" });
  assert.deepEqual(result, {
    connected: true,
    scopes: ["memory:read", "memory:write"],
    resource: "https://xmemo.dev/mcp",
  });
  assert.equal(f.credentials.length, 1);
  assert.equal(f.credentials[0].userId, USER);
  assert.equal(f.credentials[0].refreshToken, "refresh-test");
  await assert.rejects(f.coordinator.complete({ userId: USER, state: started.state, code: "replay" }), /missing_expired_or_replayed/);
});

test("does not consume a transaction for a different authenticated user", async () => {
  const f = fixture();
  const started = await f.coordinator.begin({ userId: USER, clientId: "public-client", redirectUri: CALLBACK });
  await assert.rejects(f.coordinator.complete({ userId: OTHER, state: started.state, code: "code" }), /missing_expired_or_replayed/);
  assert.equal(f.rows.size, 1);
});

test("rejects expired transactions", async () => {
  const f = fixture();
  const started = await f.coordinator.begin({ userId: USER, clientId: "public-client", redirectUri: CALLBACK });
  f.advance(601_000);
  await assert.rejects(f.coordinator.complete({ userId: USER, state: started.state, code: "code" }), /missing_expired_or_replayed/);
});

test("rejects malformed users, callback URLs and state", async () => {
  const f = fixture();
  await assert.rejects(f.coordinator.begin({ userId: "not-a-user", clientId: "x", redirectUri: CALLBACK }), /authenticated_user_required/);
  await assert.rejects(f.coordinator.begin({ userId: USER, clientId: "x", redirectUri: "http://hq.example.test/callback" }), /redirect_uri_invalid/);
  await assert.rejects(f.coordinator.complete({ userId: USER, state: "bad", code: "code" }), /state_invalid/);
});

test("fails closed when token exchange returns an incomplete token set", async () => {
  const f = fixture();
  const started = await f.coordinator.begin({ userId: USER, clientId: "public-client", redirectUri: CALLBACK });
  const broken = createXMemoOAuthTransactionCoordinator({
    transactionStore: {
      async insert() {},
      async consume() {
        return {
          user_id: USER, client_id: "public-client", redirect_uri: CALLBACK,
          resource: "https://xmemo.dev/mcp", scopes: ["memory:read", "memory:write"],
          encrypted_code_verifier: USER + ":" + "A".repeat(43),
        };
      },
    },
    credentialStore: { async saveEncrypted() { throw new Error("must_not_save"); } },
    cryptoBox: { async seal(_u, v) { return v; }, async open(_u, v) { return v.split(":").at(-1); } },
    async exchangeCode() { return { accessToken: "access", refreshToken: null, expiresIn: 60 }; },
  });
  await assert.rejects(broken.complete({ userId: USER, state: started.state, code: "code" }), /token_set_invalid/);
  assert.equal(f.credentials.length, 0);
});
