import { readFileSync } from "node:fs";
import { scoutModelUpdates } from "../evaluation/model-scout.mjs";
import { MODEL_CATALOG_SOURCES } from "../evaluation/model-catalog-sources.mjs";

const registry = JSON.parse(readFileSync(new URL("../evaluation/model-candidates.json", import.meta.url), "utf8"));
const sources = MODEL_CATALOG_SOURCES;

const snapshots = [];
const fetchErrors = [];
for (const source of sources) {
  try {
    const response = await fetch(source.source_url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "JARVIS-X-Model-Scout/1.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const ids = [...new Set(html.match(source.pattern) ?? [])].sort();
    snapshots.push({
      provider: source.provider,
      source_url: source.source_url,
      checked_at: new Date().toISOString().slice(0, 10),
      models: ids.map(model_id => ({ model_id, kind: "UNCLASSIFIED" }))
    });
  } catch (error) {
    fetchErrors.push({ provider: source.provider, source_url: source.source_url, error: String(error?.message ?? error) });
  }
}

const report = scoutModelUpdates({ registry, snapshots, excludedProviders: ["OpenRouter"] });
report.fetch_errors = fetchErrors;
report.run_status = snapshots.length === sources.length ? "ALL_SOURCES_FETCHED" : snapshots.length > 0 ? "PARTIAL_SOURCE_FAILURE" : "NO_SOURCES_FETCHED";
report.safety_note = "Discovery only. Text matches may include legacy IDs or examples. No candidate is installed, promoted, benchmarked, or routed automatically.";
console.log(JSON.stringify(report, null, 2));
if (snapshots.length === 0) process.exitCode = 2;
