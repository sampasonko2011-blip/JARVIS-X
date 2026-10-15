import { readFileSync } from "node:fs";
import { createProviderAdapters } from "../evaluation/provider-adapters.mjs";
import { runLiveBenchmark } from "../evaluation/live-benchmark.mjs";

if (process.env.JX_LIVE_BENCHMARK !== "1") {
  console.error("Live provider calls are disabled by default. Set JX_LIVE_BENCHMARK=1 and pass one or more exact --candidate IDs to authorize bounded calls.");
  process.exitCode = 2;
} else {
  const candidateIds = [];
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--candidate" && process.argv[i + 1]) candidateIds.push(process.argv[++i]);
    else if (process.argv[i].startsWith("--candidate=")) candidateIds.push(process.argv[i].slice("--candidate=".length));
    else { console.error(`Unknown or incomplete argument: ${process.argv[i]}`); process.exitCode = 2; break; }
  }
  if (process.exitCode !== 2) {
    try {
      const registry = JSON.parse(readFileSync(new URL("../evaluation/model-candidates.json", import.meta.url), "utf8"));
      const { adapters, configured_providers, note } = createProviderAdapters({ registry });
      const report = await runLiveBenchmark({ registry, adapters, candidateIds });
      report.configured_providers = configured_providers;
      report.adapter_note = note;
      console.log(JSON.stringify(report, null, 2));
      if (report.results.some(item => item.status !== "OBSERVED_PASS_NOT_BENCHMARK_PROMOTION")) process.exitCode = 1;
    } catch (error) {
      console.error(String(error?.message ?? error));
      process.exitCode = 1;
    }
  }
}
