import type { MemoryStore } from "./memory.js";
import type { ClaimStatus } from "./types.js";

export type MemoryKind = "working" | "episodic" | "semantic" | "procedural" | "evidence";
export type MemoryStatus = ClaimStatus;

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  kind: MemoryKind;
  status: MemoryStatus;
  source?: string;
  project?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  supersededBy?: string;
  confidence?: number;
}

export interface MemorySearchOptions {
  limit?: number;
  project?: string;
  kinds?: MemoryKind[];
  includeSuperseded?: boolean;
  now?: Date;
}

export interface ScoredMemory {
  record: MemoryRecord;
  score: number;
  freshness: "fresh" | "stale" | "unknown";
}

const VALID_STATUSES = new Set<MemoryStatus>([
  "OBSERVED", "VALIDATED", "PROPOSED", "UNPROVEN", "REJECTED", "SUPERSEDED",
]);
const VALID_KINDS = new Set<MemoryKind>(["working", "episodic", "semantic", "procedural", "evidence"]);
const TOKEN = /[\p{L}\p{N}_-]{2,}/gu;

function tokens(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().match(TOKEN) ?? [])];
}

function validDate(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Memory " + field + " must be a valid ISO date.");
  return parsed;
}

/**
 * Minimal retrieval layer over a MemoryStore. Records carry provenance, claim
 * status, project scope and freshness metadata; search ranks lexical relevance.
 * This is deliberately not represented as semantic/vector search.
 */
export class MemoryOS {
  constructor(private readonly store: MemoryStore, private readonly namespace = "jarvis-x:memory:") {
    if (!namespace.trim()) throw new Error("Memory namespace must be non-empty.");
  }

  save(input: Omit<MemoryRecord, "createdAt" | "updatedAt"> & Partial<Pick<MemoryRecord, "createdAt" | "updatedAt">>, now = new Date()): MemoryRecord {
    if (!input.id.trim() || !input.title.trim() || !input.content.trim()) {
      throw new Error("Memory id, title, and content must be non-empty.");
    }
    if (!VALID_KINDS.has(input.kind)) throw new Error("Unsupported memory kind: " + input.kind);
    if (!VALID_STATUSES.has(input.status)) throw new Error("Unsupported memory status: " + input.status);
    if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) {
      throw new Error("Memory confidence must be between 0 and 1.");
    }
    const existing = this.get(input.id);
    const createdAt = input.createdAt ?? existing?.createdAt ?? now.toISOString();
    const updatedAt = input.updatedAt ?? now.toISOString();
    validDate(createdAt, "createdAt");
    validDate(updatedAt, "updatedAt");
    if (input.expiresAt) validDate(input.expiresAt, "expiresAt");
    const record: MemoryRecord = { ...input, createdAt, updatedAt };
    this.store.set(this.key(input.id), record);
    return record;
  }

  get(id: string): MemoryRecord | undefined {
    return this.store.get<MemoryRecord>(this.key(id));
  }

  supersede(id: string, replacementId: string, now = new Date()): MemoryRecord {
    const previous = this.get(id);
    if (!previous) throw new Error("Cannot supersede missing memory: " + id);
    if (!this.get(replacementId)) throw new Error("Replacement memory does not exist: " + replacementId);
    return this.save({ ...previous, status: "SUPERSEDED", supersededBy: replacementId, updatedAt: now.toISOString() }, now);
  }

  search(query: string, options: MemorySearchOptions = {}): ScoredMemory[] {
    const queryTokens = tokens(query);
    if (!queryTokens.length) return [];
    const now = options.now ?? new Date();
    const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 10)));
    const prefix = this.namespace;
    const records: MemoryRecord[] = [];
    // MemoryStore intentionally exposes only get/set, so this index is kept
    // separately under one reserved key rather than relying on backend scans.
    const ids = this.store.get<string[]>(prefix + "__index") ?? [];
    for (const id of ids) {
      const record = this.get(id);
      if (!record) continue;
      if (options.project && record.project !== options.project) continue;
      if (options.kinds && !options.kinds.includes(record.kind)) continue;
      if (!options.includeSuperseded && record.status === "SUPERSEDED") continue;
      if (record.expiresAt && Date.parse(record.expiresAt) <= now.getTime()) continue;
      records.push(record);
    }

    const results: ScoredMemory[] = [];
    for (const record of records) {
      const titleTokens = new Set(tokens(record.title));
      const contentTokens = new Set(tokens(record.content));
      const tagTokens = new Set((record.tags ?? []).flatMap(tokens));
      const hits = queryTokens.reduce((n, token) => n + (titleTokens.has(token) ? 3 : 0) + (tagTokens.has(token) ? 2 : 0) + (contentTokens.has(token) ? 1 : 0), 0);
      if (!hits) continue;
      const updated = Date.parse(record.updatedAt);
      const ageDays = Number.isFinite(updated) ? Math.max(0, (now.getTime() - updated) / 86_400_000) : Infinity;
      const freshness: ScoredMemory["freshness"] = !Number.isFinite(ageDays) ? "unknown" : ageDays <= 30 ? "fresh" : "stale";
      const statusWeight = record.status === "VALIDATED" ? 1.25 : record.status === "OBSERVED" ? 1.1 : record.status === "PROPOSED" ? 0.9 : record.status === "UNPROVEN" ? 0.8 : record.status === "REJECTED" ? 0.6 : 0;
      const freshnessWeight = freshness === "fresh" ? 1.1 : freshness === "stale" ? 0.9 : 1;
      results.push({ record, score: hits * statusWeight * freshnessWeight, freshness });
    }
    return results.sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt)).slice(0, limit);
  }

  private key(id: string): string { return this.namespace + "record:" + id; }
}
