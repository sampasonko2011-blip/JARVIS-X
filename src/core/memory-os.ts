import { createHash } from "node:crypto";
import type { MemoryStore } from "./memory.js";
import type { ClaimStatus } from "./types.js";

export type MemoryKind = "working" | "episodic" | "semantic" | "procedural" | "evidence";
export type MemoryStatus = ClaimStatus;
export interface MemoryRecord {
  id: string; title: string; content: string; kind: MemoryKind; status: MemoryStatus;
  source?: string; project?: string; tags?: string[]; createdAt: string; updatedAt: string;
  expiresAt?: string; supersededBy?: string; confidence?: number;
}
export interface MemorySearchOptions { limit?: number; project?: string; kinds?: MemoryKind[]; includeSuperseded?: boolean; now?: Date; }
export interface ScoredMemory { record: MemoryRecord; score: number; freshness: "fresh" | "stale" | "unknown"; }
export interface MemoryExportBundle {
  schemaVersion: 1;
  exportedAt: string;
  records: MemoryRecord[];
  checkpoints: WorkingCheckpoint[];
  checksum: string;
}
export interface WorkingCheckpoint {
  project: string;
  task: string;
  nextAction: string;
  blockers?: string[];
  contextRefs?: string[];
  updatedAt: string;
  expiresAt?: string;
}
const VALID_STATUSES = new Set<MemoryStatus>(["OBSERVED", "VALIDATED", "PROPOSED", "UNPROVEN", "REJECTED", "SUPERSEDED"]);
const VALID_KINDS = new Set<MemoryKind>(["working", "episodic", "semantic", "procedural", "evidence"]);
const TOKEN = /[\p{L}\p{N}_-]{2,}/gu;
const SECRET_LIKE = /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_|github_pat_|sk-[A-Za-z0-9_-]{16,}|xox[baprs]-)[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9._~-]{16,})/i;
function exportPayload(exportedAt: string, records: MemoryRecord[], checkpoints: WorkingCheckpoint[]) { return { schemaVersion: 1 as const, exportedAt, records, checkpoints }; }
function checksum(payload: ReturnType<typeof exportPayload>): string { return createHash("sha256").update(JSON.stringify(payload)).digest("hex"); }
function tokens(value: string): string[] { return [...new Set(value.toLocaleLowerCase().match(TOKEN) ?? [])]; }
function validDate(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("Memory " + field + " must be a valid ISO date.");
  return parsed;
}

/** Local lexical retrieval with project scope, provenance, freshness and evidence status. Not vector search. */
export class MemoryOS {
  constructor(private readonly store: MemoryStore, private readonly namespace = "jarvis-x:memory:") {
    if (!namespace.trim()) throw new Error("Memory namespace must be non-empty.");
  }

  save(input: Omit<MemoryRecord, "createdAt" | "updatedAt"> & Partial<Pick<MemoryRecord, "createdAt" | "updatedAt">>, now = new Date()): MemoryRecord {
    if (!input.id.trim() || !input.title.trim() || !input.content.trim()) throw new Error("Memory id, title, and content must be non-empty.");
    if (!VALID_KINDS.has(input.kind)) throw new Error("Unsupported memory kind: " + input.kind);
    if (!VALID_STATUSES.has(input.status)) throw new Error("Unsupported memory status: " + input.status);
    if (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) throw new Error("Memory confidence must be between 0 and 1.");
    const existing = this.get(input.id);
    const createdAt = input.createdAt ?? existing?.createdAt ?? now.toISOString();
    const updatedAt = input.updatedAt ?? now.toISOString();
    validDate(createdAt, "createdAt"); validDate(updatedAt, "updatedAt");
    if (input.expiresAt) validDate(input.expiresAt, "expiresAt");
    const record: MemoryRecord = { ...input, createdAt, updatedAt };
    const ids = this.store.get<string[]>(this.indexKey()) ?? [];
    const nextIds = ids.includes(input.id) ? ids : [...ids, input.id];
    if (!this.store.setMany) throw new Error("Backing store does not support atomic record/index updates; refusing a partial memory write.");
    this.store.setMany([{ key: this.key(input.id), value: record }, { key: this.indexKey(), value: nextIds }]);
    return record;
  }

  /** Create a portable integrity-checked snapshot. Secret-like content is rejected, never silently exported. */
  exportBundle(now = new Date()): MemoryExportBundle {
    const ids = this.store.get<string[]>(this.indexKey()) ?? [];
    const records = ids.map(id => this.get(id)).filter((record): record is MemoryRecord => Boolean(record)).sort((a, b) => a.id.localeCompare(b.id));
    for (const record of records) if (SECRET_LIKE.test(record.content) || SECRET_LIKE.test(record.title)) throw new Error("Memory export blocked: secret-like material detected in record " + record.id);
    const checkpointIds = this.store.get<string[]>(this.checkpointIndexKey()) ?? [];
    const checkpoints = checkpointIds.map(project => this.store.get<WorkingCheckpoint>(this.checkpointKey(project)))
      .filter((checkpoint): checkpoint is WorkingCheckpoint => Boolean(checkpoint))
      .sort((a, b) => a.project.localeCompare(b.project));
    for (const checkpoint of checkpoints) {
      if ([checkpoint.project, checkpoint.task, checkpoint.nextAction, ...(checkpoint.blockers ?? [])].some(value => SECRET_LIKE.test(value))) {
        throw new Error("Memory export blocked: secret-like material detected in checkpoint " + checkpoint.project);
      }
    }
    const exportedAt = now.toISOString(); const payload = exportPayload(exportedAt, records, checkpoints);
    return { ...payload, checksum: checksum(payload) };
  }

  /** Verify the entire bundle before atomically importing; existing IDs are replaced. */
  importBundle(bundle: MemoryExportBundle): { imported: number; checkpointsImported: number; checksum: string } {
    if (!bundle || bundle.schemaVersion !== 1 || !Array.isArray(bundle.records) || !Array.isArray(bundle.checkpoints) || typeof bundle.exportedAt !== "string" || !Number.isFinite(Date.parse(bundle.exportedAt)) || typeof bundle.checksum !== "string") throw new Error("Invalid memory export bundle.");
    const payload = exportPayload(bundle.exportedAt, bundle.records, bundle.checkpoints);
    if (checksum(payload) !== bundle.checksum) throw new Error("Memory export checksum mismatch.");
    const seen = new Set<string>();
    for (const record of bundle.records) {
      if (!record || typeof record.id !== "string" || !record.id.trim() || typeof record.title !== "string" || !record.title.trim() || typeof record.content !== "string" || !record.content.trim() || !VALID_KINDS.has(record.kind) || !VALID_STATUSES.has(record.status) || typeof record.createdAt !== "string" || typeof record.updatedAt !== "string") throw new Error("Memory export contains an invalid record.");
      if (seen.has(record.id)) throw new Error("Memory export contains duplicate record IDs."); seen.add(record.id);
      validDate(record.createdAt, "createdAt"); validDate(record.updatedAt, "updatedAt"); if (record.expiresAt) validDate(record.expiresAt, "expiresAt");
      if (SECRET_LIKE.test(record.content) || SECRET_LIKE.test(record.title)) throw new Error("Memory import blocked: secret-like material detected in record " + record.id);
    }
    const checkpointProjects = new Set<string>();
    for (const checkpoint of bundle.checkpoints) {
      if (!checkpoint || typeof checkpoint.project !== "string" || !checkpoint.project.trim() ||
          typeof checkpoint.task !== "string" || !checkpoint.task.trim() ||
          typeof checkpoint.nextAction !== "string" || !checkpoint.nextAction.trim() ||
          typeof checkpoint.updatedAt !== "string") throw new Error("Memory export contains an invalid checkpoint.");
      if (checkpointProjects.has(checkpoint.project)) throw new Error("Memory export contains duplicate checkpoint projects.");
      checkpointProjects.add(checkpoint.project);
      validDate(checkpoint.updatedAt, "checkpoint.updatedAt");
      if (checkpoint.expiresAt) validDate(checkpoint.expiresAt, "checkpoint.expiresAt");
      if ([checkpoint.project, checkpoint.task, checkpoint.nextAction, ...(checkpoint.blockers ?? [])].some(value => SECRET_LIKE.test(value))) {
        throw new Error("Memory import blocked: secret-like material detected in checkpoint " + checkpoint.project);
      }
    }
    const existing = this.store.get<string[]>(this.indexKey()) ?? [];
    const nextIds = [...new Set([...existing, ...bundle.records.map(record => record.id)])];
    const existingProjects = this.store.get<string[]>(this.checkpointIndexKey()) ?? [];
    const nextProjects = [...new Set([...existingProjects, ...bundle.checkpoints.map(checkpoint => checkpoint.project)])];
    if (!this.store.setMany) throw new Error("Backing store does not support atomic import; refusing a partial memory restore.");
    this.store.setMany([
      ...bundle.records.map(record => ({ key: this.key(record.id), value: record })),
      ...bundle.checkpoints.map(checkpoint => ({ key: this.checkpointKey(checkpoint.project), value: checkpoint })),
      { key: this.indexKey(), value: nextIds },
      { key: this.checkpointIndexKey(), value: nextProjects }
    ]);
    return { imported: bundle.records.length, checkpointsImported: bundle.checkpoints.length, checksum: bundle.checksum };
  }
  get(id: string): MemoryRecord | undefined { return this.store.get<MemoryRecord>(this.key(id)); }

  /** Delete a record with an optimistic timestamp check; unsupported stores fail closed. */
  delete(id: string, expectedUpdatedAt: string): void {
    if (!id.trim() || !expectedUpdatedAt.trim()) throw new Error("Memory id and expectedUpdatedAt are required.");
    const current = this.get(id);
    if (!current) throw new Error("Memory record does not exist: " + id);
    if (current.updatedAt !== expectedUpdatedAt) throw new Error("Memory revision conflict; reload before deleting.");
    if (!this.store.deleteMany) throw new Error("Backing store does not support atomic deletion; refusing partial delete.");
    const ids = this.store.get<string[]>(this.indexKey()) ?? [];
    this.store.deleteMany([this.key(id)], [{ key: this.indexKey(), value: ids.filter(value => value !== id) }]);
  }

  saveCheckpoint(input: Omit<WorkingCheckpoint, "updatedAt"> & Partial<Pick<WorkingCheckpoint, "updatedAt">>, now = new Date()): WorkingCheckpoint {
    if (!input.project.trim() || !input.task.trim() || !input.nextAction.trim()) {
      throw new Error("Checkpoint project, task, and nextAction must be non-empty.");
    }
    const updatedAt = input.updatedAt ?? now.toISOString();
    validDate(updatedAt, "checkpoint.updatedAt");
    if (input.expiresAt) validDate(input.expiresAt, "checkpoint.expiresAt");
    const checkpoint: WorkingCheckpoint = { ...input, updatedAt };
    if (!this.store.setMany) throw new Error("Backing store does not support atomic checkpoint/index updates; refusing a partial checkpoint write.");
    const projects = this.store.get<string[]>(this.checkpointIndexKey()) ?? [];
    this.store.setMany([
      { key: this.checkpointKey(input.project), value: checkpoint },
      { key: this.checkpointIndexKey(), value: projects.includes(input.project) ? projects : [...projects, input.project] }
    ]);
    return checkpoint;
  }

  loadCheckpoint(project: string, now = new Date()): WorkingCheckpoint | undefined {
    if (!project.trim()) throw new Error("Checkpoint project must be non-empty.");
    const checkpoint = this.store.get<WorkingCheckpoint>(this.checkpointKey(project));
    if (!checkpoint) return undefined;
    if (checkpoint.expiresAt && Date.parse(checkpoint.expiresAt) <= now.getTime()) return undefined;
    return checkpoint;
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
    const ids = this.store.get<string[]>(this.indexKey()) ?? [];
    const results: ScoredMemory[] = [];
    for (const id of ids) {
      const record = this.get(id);
      if (!record || (options.project && record.project !== options.project)) continue;
      if (options.kinds && !options.kinds.includes(record.kind)) continue;
      if (!options.includeSuperseded && record.status === "SUPERSEDED") continue;
      if (record.expiresAt && Date.parse(record.expiresAt) <= now.getTime()) continue;
      const title = new Set(tokens(record.title));
      const content = new Set(tokens(record.content));
      const tags = new Set((record.tags ?? []).flatMap(tokens));
      const hits = queryTokens.reduce((n, token) => n + (title.has(token) ? 3 : 0) + (tags.has(token) ? 2 : 0) + (content.has(token) ? 1 : 0), 0);
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
  private indexKey(): string { return this.namespace + "__index"; }
  private checkpointIndexKey(): string { return this.namespace + "__checkpoint_index"; }
  private checkpointKey(project: string): string { return this.namespace + "checkpoint:" + project; }
}
