import { createCapabilityRegistry } from "./capability-registry.mjs";

const TEXT_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    text: { type: "string", maxLength: 5_000 }
  },
  required: ["text"],
  additionalProperties: false
});

/** One deterministic, read-only local capability; no network or persistent state. */
export function createDefaultCapabilityRegistry() {
  const registry = createCapabilityRegistry({
    permissionCheck: async ({ userId, permission, consequence }) =>
      typeof userId === "string" && userId.trim().length > 0 &&
      permission === "text.analyze" && consequence === "read",
    approvalCheck: async () => false,
    maxConcurrent: 2
  });
  registry.register({
    name: "text.analyze",
    description: "Count characters, words, sentences, and paragraphs in supplied text. Use only when these measurements help answer the user's request.",
    inputSchema: TEXT_SCHEMA,
    permission: "text.analyze",
    consequence: "read",
    timeoutMs: 1_000,
    handler: async ({ input }) => {
      const text = input.text;
      const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
      const sentences = text.trim() ? (text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) ?? []).filter(part => part.trim()).length : 0;
      const paragraphs = text.trim() ? text.trim().split(/\n\s*\n/u).filter(part => part.trim()).length : 0;
      return {
        characters: text.length,
        words,
        sentences,
        paragraphs
      };
    }
  });
  registry.seal();
  return registry;
}
