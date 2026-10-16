import type { Capability, Task, Provider } from "./types.js";
import { CapabilityRegistry } from "./registry.js";

export interface Route { provider: Provider; capability: Capability; score: number; reasons: string[]; }

function words(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [];
}

function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class CapabilityRouter {
  private readonly excludedProviders: ReadonlySet<string>;
  constructor(
    private readonly registry: CapabilityRegistry,
    excludedProviders: Iterable<string> = ["openrouter"]
  ) {
    this.excludedProviders = new Set([...excludedProviders].map(value => value.trim().toLowerCase()));
  }
  route(task: Task, preferredKind: Capability["kind"]): Route[] {
    const objectiveWords = words(task.objective);
    return this.registry.find(preferredKind)
      .map(capability => {
        // Capability IDs are opaque identifiers; do not infer provider IDs from their format.
        const provider = this.registry.getProviderForCapability(capability.id);
        if (!provider || this.excludedProviders.has(provider.id.trim().toLowerCase())) return undefined;
        // Match complete words/phrases only: empty strengths and incidental substrings must not boost a route.
        const matched = capability.strengths.some(strength => containsPhrase(objectiveWords, words(strength)));
        const score = matched ? 2 : 1;
        return { provider, capability, score, reasons: ["kind match", matched ? "objective-strength match" : "generic capability match"] };
      })
      .filter((x): x is Route => Boolean(x))
      // Stable tie-breaking makes repeated runs reproducible regardless of provider registration order.
      .sort((a, b) => b.score - a.score || compareText(a.capability.id, b.capability.id) || compareText(a.provider.id, b.provider.id));
  }
}
