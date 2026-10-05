import type { LedgerEntry } from "./types.js";

export class EvidenceLedger {
  private readonly entries: LedgerEntry[] = [];
  record(entry: LedgerEntry): void { this.entries.push(structuredClone(entry)); }
  all(): readonly LedgerEntry[] { return this.entries; }
}
