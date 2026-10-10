import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface MemoryStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

/** Process-local store. Use for tests and explicitly ephemeral runs only. */
export class InMemoryStore implements MemoryStore {
  private readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  set<T>(key: string, value: T): void { this.values.set(key, value); }
}

type DiskEnvelope = { schemaVersion: 1; values: Record<string, unknown> };

/**
 * Durable, local-first JSON memory for a single JARVIS-X process.
 * Writes use temp-file + rename; corrupt or unsupported data fails closed.
 * This is not a multi-process database. Never store credentials or secrets.
 */
export class JsonFileMemoryStore implements MemoryStore {
  private readonly values = new Map<string, unknown>();

  constructor(readonly filePath: string) {
    if (!filePath.trim()) throw new Error("A non-empty memory file path is required.");
    if (!existsSync(filePath)) return;
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(filePath, "utf8")); }
    catch { throw new Error("Memory file is unreadable or invalid JSON; refusing to overwrite it."); }
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid memory envelope; refusing to overwrite it.");
    const envelope = parsed as Partial<DiskEnvelope>;
    if (envelope.schemaVersion !== 1 || !envelope.values || typeof envelope.values !== "object" || Array.isArray(envelope.values)) {
      throw new Error("Unsupported or invalid memory schema; refusing to overwrite it.");
    }
    for (const [key, value] of Object.entries(envelope.values)) this.values.set(key, value);
  }

  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }

  set<T>(key: string, value: T): void {
    if (!key.trim()) throw new Error("Memory key must be non-empty.");
    let encoded: string | undefined;
    try { encoded = JSON.stringify(value); } catch { throw new Error("Memory values must be JSON-serializable."); }
    if (encoded === undefined) throw new Error("Memory values must be JSON-serializable.");
    const existed = this.values.has(key);
    const previous = this.values.get(key);
    this.values.set(key, JSON.parse(encoded) as unknown);
    try { this.persist(); }
    catch (error) {
      if (existed) this.values.set(key, previous);
      else this.values.delete(key);
      throw error;
    }
  }

  private persist(): void {
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const payload = JSON.stringify({ schemaVersion: 1, values: Object.fromEntries(this.values.entries()) } satisfies DiskEnvelope, null, 2) + "\n";
    const temporaryPath = this.filePath + "." + randomUUID() + ".tmp";
    try {
      writeFileSync(temporaryPath, payload, { encoding: "utf8", mode: 0o600, flag: "wx" });
      chmodSync(temporaryPath, 0o600);
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      throw new Error("Failed to persist JARVIS-X memory atomically: " + (error instanceof Error ? error.message : String(error)));
    }
  }
}
