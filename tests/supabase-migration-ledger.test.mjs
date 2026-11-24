import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const liveLedger = [
  ["20261023172530", "hq_secure_memory_and_execution_ledger"],
  ["20261023175736", "hq_least_privilege_table_grants_v2"],
  ["20261023180128", "hq_authenticated_rate_limits"],
  ["20261023180213", "hq_rate_limit_rpc_returning_fix"],
  ["20261023180246", "hq_rate_limits_deny_direct_access_policy"],
  ["20261024185449", "hq_execution_ledger_server_only_writes"],
  ["20261027220313", "hq_global_budget_guard"],
  ["20261110112609", "restrict_hq_rate_limit_rpc_to_service_role"],
  ["20261110113744", "hq_xmemo_oauth_storage"],
];

test("all nine live Supabase migration ledger entries have exact version/name source files", async () => {
  const files = await readdir(migrationDir);
  for (const [version, name] of liveLedger) {
    assert.ok(files.includes(version + "_" + name + ".sql"), "missing live migration " + version + " " + name);
  }
});

test("recovered server-only rate-limit migration retains the live role guard", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261110112609_restrict_hq_rate_limit_rpc_to_service_role.sql", import.meta.url), "utf8");
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.consume_hq_rate_limit\(uuid, text\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.consume_hq_rate_limit\(uuid, text\) TO service_role/);
});

test("image-budget migration remains an unapplied, default-off source artifact", async () => {
  const files = await readdir(migrationDir);
  const imageFile = "20261102120000_hq_image_budget_guard.sql";
  assert.ok(files.includes(imageFile));
  assert.ok(!liveLedger.some(([version]) => imageFile.startsWith(version)));
  const sql = await readFile(new URL("../supabase/migrations/" + imageFile, import.meta.url), "utf8");
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /daily_limit_usd numeric\(12,6\) NOT NULL DEFAULT 0/);
});
