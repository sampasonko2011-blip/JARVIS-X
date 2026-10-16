const TRUSTED_PROVIDER_HOSTS = {
  Google: new Set(["ai.google.dev", "developers.googleblog.com"]),
  Anthropic: new Set(["platform.claude.com", "docs.anthropic.com"]),
  DeepSeek: new Set(["api-docs.deepseek.com", "deepseek.com"]),
  OpenAI: new Set(["developers.openai.com", "platform.openai.com", "openai.com"]),
  "Alibaba Qwen": new Set(["qwenlm.github.io", "github.com", "huggingface.co", "help.aliyun.com"]),
  "Mistral AI": new Set(["docs.mistral.ai", "mistral.ai"]),
  "xAI": new Set(["docs.x.ai", "x.ai"]),
  Groq: new Set(["console.groq.com", "groq.com"]),
  Cohere: new Set(["docs.cohere.com", "cohere.com"]),
  Meta: new Set(["llama.com", "www.llama.com", "ai.meta.com", "about.fb.com"]),
  Moonshot: new Set(["platform.moonshot.ai", "moonshot.ai"]),
  "Z.ai": new Set(["docs.z.ai", "z.ai"])
};

const EXCLUDED_PROVIDER_PATTERN = /openrouter/i;

function isTrustedSource(provider, sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "https:" && TRUSTED_PROVIDER_HOSTS[provider]?.has(url.hostname);
  } catch {
    return false;
  }
}

export function scoutModelUpdates({ registry, snapshots, excludedProviders = ["OpenRouter"] }) {
  const excluded = new Set(excludedProviders.map(value => value.toLowerCase()));
  const knownByProviderAndId = new Map(
    (registry?.candidates ?? [])
      .filter(candidate => candidate?.provider && candidate?.model_id)
      .map(candidate => [`${candidate.provider.toLowerCase()}::${candidate.model_id}`, candidate])
  );
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    policy: "proposal-only; no registry writes, model downloads, routing changes, or provider calls",
    accepted_sources: [],
    rejected_sources: [],
    discoveries: [],
    lifecycle_changes: [],
    catalog_absence_reviews: [],
    excluded_candidates: []
  };

  for (const snapshot of snapshots ?? []) {
    const provider = snapshot?.provider;
    const sourceUrl = snapshot?.source_url;
    if (!provider || excluded.has(String(provider).toLowerCase()) || EXCLUDED_PROVIDER_PATTERN.test(String(provider))) {
      report.excluded_candidates.push({ provider: provider ?? null, source_url: sourceUrl ?? null, reason: "provider excluded by policy" });
      continue;
    }
    if (!isTrustedSource(provider, sourceUrl) || !snapshot.checked_at || !Array.isArray(snapshot.models)) {
      report.rejected_sources.push({ provider: provider ?? null, source_url: sourceUrl ?? null, reason: "source host, checked_at, or models list is invalid" });
      continue;
    }

    report.accepted_sources.push({ provider, source_url: sourceUrl, checked_at: snapshot.checked_at });
    for (const model of snapshot.models) {
      if (!model || typeof model.model_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,120}$/.test(model.model_id)) {
        report.rejected_sources.push({ provider, source_url: sourceUrl, reason: "invalid model identifier in snapshot" });
        continue;
      }
      const key = `${provider.toLowerCase()}::${model.model_id}`;
      const known = knownByProviderAndId.get(key);
      if (!known) {
        report.discoveries.push({
          provider,
          model_id: model.model_id,
          source_url: sourceUrl,
          source_checked_at: snapshot.checked_at,
          evidence_status: "OBSERVED",
          benchmark_status: "UNPROVEN",
          action: "PROPOSE_ADD_AFTER_REVIEW",
          kind: model.kind ?? "UNCLASSIFIED",
          roles: Array.isArray(model.roles) ? model.roles : [],
          lifecycle_status: model.lifecycle_status ?? "unverified",
          access: "Not tested by Model Scout.",
          cost: "Not verified by Model Scout."
        });
        continue;
      }
      if (model.lifecycle_status && known.lifecycle_status && model.lifecycle_status !== known.lifecycle_status) {
        report.lifecycle_changes.push({
          candidate_id: known.id,
          provider,
          model_id: model.model_id,
          previous_lifecycle_status: known.lifecycle_status,
          observed_lifecycle_status: model.lifecycle_status,
          source_url: sourceUrl,
          source_checked_at: snapshot.checked_at,
          action: "PROPOSE_LIFECYCLE_REVIEW"
        });
      }
    }

    const observedIds = new Set(snapshot.models.filter(model => typeof model?.model_id === "string").map(model => model.model_id));
    for (const candidate of registry?.candidates ?? []) {
      if (!candidate?.provider || candidate.provider.toLowerCase() !== provider.toLowerCase() || !candidate.model_id) continue;
      if (candidate.status === "SUPERSEDED" || observedIds.has(candidate.model_id)) continue;
      report.catalog_absence_reviews.push({
        candidate_id: candidate.id,
        provider,
        model_id: candidate.model_id,
        source_url: sourceUrl,
        source_checked_at: snapshot.checked_at,
        evidence_status: "UNPROVEN",
        action: "PROPOSE_CATALOG_ABSENCE_REVIEW",
        note: "The ID was not observed in this fetched page. Page extraction may be incomplete; absence alone never proves deprecation or retirement."
      });
    }
  }

  const sortBy = (a, b) => `${a.provider}:${a.model_id}`.localeCompare(`${b.provider}:${b.model_id}`);
  report.discoveries.sort(sortBy);
  report.lifecycle_changes.sort(sortBy);
  report.catalog_absence_reviews.sort(sortBy);
  return report;
}
