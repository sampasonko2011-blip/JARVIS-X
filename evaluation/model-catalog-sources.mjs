export const MODEL_CATALOG_SOURCES = Object.freeze([
  {
    provider: "Google",
    source_url: "https://ai.google.dev/gemini-api/docs/models",
    pattern: /(?:gemini|gemma)-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "Anthropic",
    source_url: "https://platform.claude.com/docs/en/models/overview",
    pattern: /claude-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "DeepSeek",
    source_url: "https://api-docs.deepseek.com/quick_start/pricing/",
    pattern: /deepseek-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "OpenAI",
    source_url: "https://platform.openai.com/docs/models",
    pattern: /(?:gpt|o[1-9])-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "Mistral AI",
    source_url: "https://docs.mistral.ai/getting-started/models/models_overview/",
    pattern: /(?:mistral|ministral|codestral|devstral|pixtral|magistral)-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "Groq",
    source_url: "https://console.groq.com/docs/models",
    pattern: /(?:llama|mixtral|gemma|qwen|deepseek|gpt-oss)-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "xAI",
    source_url: "https://docs.x.ai/docs/models",
    pattern: /grok-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "Cohere",
    source_url: "https://docs.cohere.com/docs/models",
    pattern: /(?:command|embed|rerank|aya)-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "Alibaba Qwen",
    source_url: "https://help.aliyun.com/zh/model-studio/getting-started/models",
    pattern: /qwen[0-9.]*-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "Meta",
    source_url: "https://www.llama.com/docs/model-cards-and-prompt-formats/",
    pattern: /(?:llama|meta-llama)[/-][a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "Moonshot",
    source_url: "https://platform.moonshot.ai/docs/guide/kimi-k2-5-quickstart",
    pattern: /kimi-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  },
  {
    provider: "Z.ai",
    source_url: "https://docs.z.ai/guides/llm/glm-4.5",
    pattern: /glm-[a-z0-9]+(?:[.-][a-z0-9]+)*/gi
  }
]);
