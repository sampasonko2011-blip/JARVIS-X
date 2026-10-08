import type { Capability, Provider } from "./types.js";

export class CapabilityRegistry {
  private readonly providers = new Map<string, Provider>();
  register(provider: Provider): void { this.providers.set(provider.id, provider); }
  list(): Capability[] { return [...this.providers.values()].flatMap(p => p.capabilities); }
  getProvider(providerId: string): Provider | undefined { return this.providers.get(providerId); }
  find(kind: Capability["kind"]): Capability[] { return this.list().filter(c => c.kind === kind); }
}
