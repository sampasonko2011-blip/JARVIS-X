export interface MemoryStore { get<T>(key: string): T | undefined; set<T>(key: string, value: T): void; }

export class InMemoryStore implements MemoryStore {
  private readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  set<T>(key: string, value: T): void { this.values.set(key, value); }
}
