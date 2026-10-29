import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const archive = await readFile(new URL("../apex-career-os/performance-archive/index.html", import.meta.url), "utf8");
const hq = await readFile(new URL("../hq/hq.js", import.meta.url), "utf8");
const hqHtml = await readFile(new URL("../hq/index.html", import.meta.url), "utf8");
const gateway = await readFile(new URL("../supabase/functions/hq-gateway-v12/index.ts", import.meta.url), "utf8");
const rateMigration = await readFile(new URL("../supabase/migrations/20261026100000_hq_rate_limit_server_only_rpc.sql", import.meta.url), "utf8");

test("Performance Archive validates imported records before replacing local state", () => {
  assert.match(archive, /function validArchive\(value\)/);
  assert.match(archive, /RECORD_LIMIT=5000/);
  assert.match(archive, /new Set\(ids\)\.size!==ids\.length/);
  assert.match(archive, /if\(!validArchive\(x\)\)throw new Error/);
  assert.match(archive, /f\.size>5\*1024\*1024/);
});

test("Performance Archive restricts imported video links to safe HTTP(S) URLs", () => {
  assert.match(archive, /u\.protocol==='https:'\|\|u\.protocol==='http:'/);
  assert.match(archive, /!u\.username&&!u\.password/);
  assert.match(archive, /if\(record\.url!==undefined&&record\.url!==null&&!safeHttpUrl\(record\.url\)\)return false/);
  assert.match(archive, /const safeUrl=safeHttpUrl\(x\.url\)/);
});

test("Performance Archive escapes user-controlled display fields", () => {
  assert.ok(archive.includes("const esc=s=>String(s??'').replace"));
  assert.match(archive, /sub=esc\(dateFmt\(x\.date\)\)\+' · '\+esc\(x\.type\)/);
  assert.match(archive, /'<strong>'\+esc\(title\)\+'<\/strong>'/);
  assert.match(archive, /body=\[x\.focus,x\.outcome\]\.filter\(Boolean\)\.map\(esc\)/);
});

test("Cross-platform memory is off by default and legacy default-on state is not treated as consent", () => {
  assert.match(hq, /let enabled=false;/);
  assert.match(hq, /localStorage\.setItem\(MEMORY_PREFERENCE_KEY,'false'\)/);
  assert.match(hq, /Prior releases persisted "true" by default, so it is not proof of explicit consent/);
  assert.match(hqHtml, /Off by default\. Turn this on only if you want/);
  assert.doesNotMatch(hqHtml, /Enabled by default on this browser/);
});

test("Gateway still requires explicit per-request memory consent", () => {
  assert.match(gateway, /const memoryConsent = body\.memory_consent === true/);
  assert.match(gateway, /memoryConsent \? await recallMemory/);
  assert.match(gateway, /memoryConsent\s*\?\s*await storeConversationMemory/);
});

test("Rate-limit source contract matches the gateway payload and server-only migration", () => {
  assert.match(gateway, /JSON\.stringify\(\{ p_user_id: userId, p_limit_key: key \}\)/);
  assert.match(rateMigration, /CREATE OR REPLACE FUNCTION public\.consume_hq_rate_limit\(\s*p_user_id uuid,\s*p_limit_key text/s);
  assert.match(rateMigration, /REVOKE ALL ON FUNCTION public\.consume_hq_rate_limit\(uuid, text\) FROM PUBLIC, anon, authenticated/);
  assert.match(rateMigration, /GRANT EXECUTE ON FUNCTION public\.consume_hq_rate_limit\(uuid, text\) TO service_role/);
});
