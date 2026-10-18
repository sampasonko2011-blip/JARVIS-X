import type { Capability, Provider } from "./types.js";

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

export class CapabilityRegistry {
  private readonly providers = new Map<string, Provider>();
  private readonly excludedProviders: ReadonlySet<string>;

  constructor(excludedProviders: Iterable<string> = []) {
    // OpenRouter is a hard policy exclusion and cannot be removed by caller configuration.
    this.excludedProviders = new Set([
      "openrouter",
      ...[...excludedProviders].map(normalizeProviderId),
    ]);
  }

  register(provider: Provider): void {
    const normalizedId = normalizeProviderId(provider.id);
    if (!normalizedId) throw new TypeError("Provider id must not be empty");
    if (normalizedId.includes("openrouter") || this.excludedProviders.has(normalizedId)) {
      throw new Error("Provider is excluded by policy: " + normalizedId);
    }
    this.providers.set(provider.id, provider);
  }

  list(): Capability[] { return [...this.providers.values()].flatMap(p => p.capabilities); }
  getProvider(providerId: string): Provider | undefined { return this.providers.get(providerId); }
  getProviderForCapability(capabilityId: string): Provider | undefined {
    return [...this.providers.values()].find(provider =>
      provider.capabilities.some(capability => capability.id === capabilityId)
    );
  }
  find(kind: Capability["kind"]): Capability[] { return this.list().filter(c => c.kind === kind); }
}
