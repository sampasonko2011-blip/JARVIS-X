import { createHash } from "node:crypto";
import type { LedgerEntry } from "./types.js";

export interface HashedLedgerEntry extends LedgerEntry {
  readonly sequence: number;
  readonly previousHash: string;
  readonly hash: string;
}

const GENESIS_HASH = "0".repeat(64);

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map(key =>
    JSON.stringify(key) + ":" + canonicalize(record[key])
  ).join(",") + "}";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Append-only, in-memory evidence ledger with a SHA-256 hash chain.
 * This detects mutation/reordering while this ledger instance is retained.
 * It is NOT durable storage, a digital signature, or proof of who authored an entry.
 */
export class EvidenceLedger {
  private readonly entries: HashedLedgerEntry[] = [];

  record(entry: LedgerEntry): HashedLedgerEntry {
    const snapshot = structuredClone(entry);
    const sequence = this.entries.length;
    const previousHash = this.entries.at(-1)?.hash ?? GENESIS_HASH;
    const hash = sha256(canonicalize({ sequence, previousHash, entry: snapshot }));
    const chained: HashedLedgerEntry = Object.freeze({
      ...snapshot,
      sequence,
      previousHash,
      hash
    });
    this.entries.push(chained);
    return structuredClone(chained);
  }

  all(): readonly HashedLedgerEntry[] {
    return this.entries.map(entry => structuredClone(entry));
  }

  verifyIntegrity(): { valid: boolean; checked: number; failureIndex?: number; reason?: string; headHash: string } {
    let previousHash = GENESIS_HASH;
    for (let index = 0; index < this.entries.length; index += 1) {
      const current = this.entries[index];
      if (current.sequence !== index) {
        return { valid: false, checked: index, failureIndex: index, reason: "SEQUENCE_MISMATCH", headHash: previousHash };
      }
      if (current.previousHash !== previousHash) {
        return { valid: false, checked: index, failureIndex: index, reason: "PREVIOUS_HASH_MISMATCH", headHash: previousHash };
      }
      const { sequence, previousHash: prior, hash, ...entry } = current;
      const expected = sha256(canonicalize({ sequence, previousHash: prior, entry }));
      if (hash !== expected) {
        return { valid: false, checked: index, failureIndex: index, reason: "ENTRY_HASH_MISMATCH", headHash: previousHash };
      }
      previousHash = hash;
    }
    return { valid: true, checked: this.entries.length, headHash: previousHash };
  }
}
