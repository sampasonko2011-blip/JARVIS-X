const enabled = process.env.JARVIS_EVAL_ENABLE_REAL_PROVIDERS === "1";
const maxCalls = Number(process.env.JARVIS_EVAL_MAX_CALLS);
const maxCostUsd = Number(process.env.JARVIS_EVAL_MAX_COST_USD);
const adapter = process.env.JARVIS_EVAL_ADAPTER;
if (!enabled) {
  console.error("Refusing provider calls: set JARVIS_EVAL_ENABLE_REAL_PROVIDERS=1 only after reviewing the protocol.");
  process.exit(2);
}
if (!adapter || !Number.isSafeInteger(maxCalls) || maxCalls < 1 ||
    !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
  console.error("Refusing provider calls: configure an adapter and finite positive JARVIS_EVAL_MAX_CALLS and JARVIS_EVAL_MAX_COST_USD.");
  process.exit(2);
}
console.error("No provider adapter is implemented yet. Refusing to dispatch any network calls.");
process.exit(2);
