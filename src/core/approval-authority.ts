import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export interface ApprovalPayload {
  version: 1;
  subject: string;
  action: string;
  resource: string;
  scope: string;
  candidateRevision: string;
  audience: string;
  policyVersion: string;
  issuedAt: number;
  expiresAt: number;
  jti: string;
  keyId: string;
}
export interface SignedApproval { payload: ApprovalPayload; signature: string; }
export interface ApprovalKeyProvider {
  /** Return an active secret for this key id. Secret bytes must come from an authorized secret manager. */
  getSigningKey(keyId: string): Promise<Uint8Array | undefined>;
}
export interface ApprovalReplayStore {
  /** Atomically claim a token id until expiry. False means already consumed. */
  consumeOnce(jti: string, expiresAt: number): Promise<boolean>;
}
export interface ApprovalIssueInput {
  subject: string; action: string; resource: string; scope: string;
  candidateRevision: string; audience: string; policyVersion: string;
  keyId: string; ttlSeconds: number;
}
export interface ApprovalVerifyContext {
  authenticatedSubject: string;
  action: string;
  resource: string;
  scope: string;
  candidateRevision: string;
  audience: string;
  policyVersion: string;
  now?: number;
}
function canonical(payload: ApprovalPayload): string {
  return JSON.stringify([
    payload.version, payload.subject, payload.action, payload.resource, payload.scope,
    payload.candidateRevision, payload.audience, payload.policyVersion,
    payload.issuedAt, payload.expiresAt, payload.jti, payload.keyId
  ]);
}
function nonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error("Approval " + field + " is required.");
}

/**
 * HMAC-signed, exact-scope approvals with durable replay protection supplied by the host.
 * This module does not authenticate users or persist keys/nonces itself. Missing trust
 * dependencies fail closed; callers must inject authenticated identity, managed keys,
 * and an atomic durable replay store before enabling consequential operations.
 */
export class ApprovalAuthority {
  constructor(private readonly keys: ApprovalKeyProvider, private readonly replay: ApprovalReplayStore) {}

  async issue(input: ApprovalIssueInput, authenticatedIssuer: string, now = Date.now()): Promise<SignedApproval> {
    for (const [field, value] of Object.entries({
      subject: input.subject, action: input.action, resource: input.resource, scope: input.scope,
      candidateRevision: input.candidateRevision, audience: input.audience,
      policyVersion: input.policyVersion, keyId: input.keyId, authenticatedIssuer
    })) nonEmpty(value, field);
    if (input.subject !== authenticatedIssuer) throw new Error("Approval issuer identity does not match the subject.");
    if (!Number.isSafeInteger(input.ttlSeconds) || input.ttlSeconds < 1 || input.ttlSeconds > 900) {
      throw new Error("Approval TTL must be between 1 and 900 seconds.");
    }
    const secret = await this.keys.getSigningKey(input.keyId);
    if (!secret || secret.byteLength < 32) throw new Error("Trusted approval signing key unavailable; refusing to issue.");
    const payload: ApprovalPayload = {
      version: 1, subject: input.subject, action: input.action, resource: input.resource,
      scope: input.scope, candidateRevision: input.candidateRevision, audience: input.audience,
      policyVersion: input.policyVersion, issuedAt: now, expiresAt: now + input.ttlSeconds * 1000,
      jti: randomUUID(), keyId: input.keyId
    };
    const signature = createHmac("sha256", secret).update(canonical(payload)).digest("base64url");
    return { payload, signature };
  }

  async verifyAndConsume(token: SignedApproval, context: ApprovalVerifyContext): Promise<boolean> {
    if (!token || !token.payload || typeof token.payload !== "object" || Array.isArray(token.payload) ||
        typeof token.signature !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token.signature) ||
        !context || typeof context !== "object") return false;
    const p = token.payload;
    const expected = {
      subject: context.authenticatedSubject, action: context.action, resource: context.resource,
      scope: context.scope, candidateRevision: context.candidateRevision,
      audience: context.audience, policyVersion: context.policyVersion
    };
    for (const [field, value] of Object.entries(expected)) {
      if (typeof value !== "string" || !value.trim() || typeof p[field as keyof ApprovalPayload] !== "string" ||
          p[field as keyof ApprovalPayload] !== value) return false;
    }
    if (p.version !== 1 || typeof p.jti !== "string" || !p.jti.trim() ||
        typeof p.keyId !== "string" || !p.keyId.trim() ||
        !Number.isSafeInteger(p.issuedAt) || !Number.isSafeInteger(p.expiresAt)) return false;
    const now = context.now ?? Date.now();
    if (!Number.isSafeInteger(now)) return false;
    if (p.issuedAt > now || p.expiresAt <= now || p.expiresAt - p.issuedAt > 900_000) return false;
    const secret = await this.keys.getSigningKey(p.keyId);
    if (!secret || secret.byteLength < 32) return false;
    let supplied: Buffer;
    try { supplied = Buffer.from(token.signature, "base64url"); } catch { return false; }
    const actual = createHmac("sha256", secret).update(canonical(p)).digest();
    if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) return false;
    try { return await this.replay.consumeOnce(p.jti, p.expiresAt); }
    catch { return false; }
  }
}
