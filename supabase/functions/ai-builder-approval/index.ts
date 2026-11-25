const ALLOWED_PERMISSIONS = new Set(["pure:compute", "input:json", "output:json"]);
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error("approval_configuration_missing");
  return value;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map(key => JSON.stringify(key) + ":" + stable(object[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function normalizeContract(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("approval_contract_invalid");
  const contract = value as Record<string, any>;
  if (!Array.isArray(contract.permissions)) throw new Error("approval_permissions_invalid");
  const permissions = [...new Set(contract.permissions)].sort();
  if (permissions.some(p => typeof p !== "string" || !ALLOWED_PERMISSIONS.has(p))) throw new Error("approval_permission_denied");
  const inputs = contract.inputs, outputs = contract.outputs, budget = contract.budget;
  for (const spec of [inputs, outputs]) {
    if (!spec || spec.contentType !== "application/json" || !Number.isInteger(spec.maxBytes) || spec.maxBytes < 1 || spec.maxBytes > 65536) {
      throw new Error("approval_io_contract_invalid");
    }
  }
  if (!budget || !Number.isInteger(budget.timeoutMs) || budget.timeoutMs < 100 || budget.timeoutMs > 30000 ||
      !Number.isInteger(budget.memoryMb) || budget.memoryMb < 64 || budget.memoryMb > 512 || budget.spendEUR !== 0) {
    throw new Error("approval_budget_invalid");
  }
  return { permissions, inputs, outputs, budget };
}
async function userFor(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]{20,4096})$/)?.[1];
  if (!token || token.split(".").length !== 3) return null;
  const key = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")
    ? (JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default ?? "")
    : Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!key) return null;
  const auth = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: key, authorization: "Bearer " + token },
    signal: AbortSignal.timeout(5_000)
  });
  if (!auth.ok) return null;
  const user = await auth.json().catch(() => null);
  if (!user || typeof user.id !== "string" || user.is_anonymous === true) return null;
  return { id: user.id as string };
}
async function rest(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return await fetch(env("SUPABASE_URL") + "/rest/v1/" + path, {
    ...init,
    headers: { apikey: key, authorization: "Bearer " + key, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(8_000)
  });
}
async function body(req: Request) {
  const text = await req.text();
  if (text.length > 16_384) throw new Error("approval_body_too_large");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("approval_body_invalid");
  return value as Record<string, unknown>;
}
Deno.serve(async req => {
  if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);
  try {
    const user = await userFor(req);
    if (!user) return response({ error: "authenticated_human_session_required" }, 401);
    const url = new URL(req.url);
    const input = await body(req);
    if (url.pathname.endsWith("/approve")) {
      if (input.human_confirmed !== true) return response({ error: "explicit_human_confirmation_required" }, 400);
      const artifactHash = input.artifact_hash;
      if (typeof artifactHash !== "string" || !/^[a-f0-9]{64}$/.test(artifactHash)) return response({ error: "artifact_hash_invalid" }, 400);
      const contract = normalizeContract(input.contract);
      const approvalDigest = await hash(stable({ schema: "jarvis.tool-approval.v1", artifactHash, contract }));
      if (input.approval_digest !== approvalDigest) return response({ error: "approval_digest_mismatch" }, 409);
      const contractHash = await hash(stable(contract));
      const existingQuery = new URLSearchParams({ select: "id,created_at", user_id: "eq." + user.id,
        artifact_hash: "eq." + artifactHash, approval_digest: "eq." + approvalDigest,
        contract_hash: "eq." + contractHash, revoked_at: "is.null", limit: "1" });
      const existingResponse = await rest("ai_builder_l3_approvals?" + existingQuery);
      if (!existingResponse.ok) { await existingResponse.text(); return response({ error: "approval_lookup_failed" }, 503); }
      const existingRows = await existingResponse.json().catch(() => []);
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      if (existing?.id) return response({ approved: true, already_approved: true, approval_id: existing.id,
        artifact_hash: artifactHash, approval_digest: approvalDigest, contract_hash: contractHash,
        actor: user.id, approved_at: existing.created_at }, 200);
      const saved = await rest("ai_builder_l3_approvals", {
        method: "POST", headers: { prefer: "return=representation" },
        body: JSON.stringify({ user_id: user.id, artifact_hash: artifactHash, approval_digest: approvalDigest,
          contract_hash: contractHash, permission_contract: contract, revoked_at: null })
      });
      if (!saved.ok) { await saved.text(); return response({ error: "approval_persistence_failed" }, 503); }
      const rows = await saved.json().catch(() => []);
      if (!Array.isArray(rows) || !rows[0]?.id) return response({ error: "approval_receipt_missing" }, 503);
      return response({ approved: true, approval_id: rows[0].id, artifact_hash: artifactHash,
        approval_digest: approvalDigest, contract_hash: contractHash, actor: user.id, approved_at: rows[0].created_at }, 201);
    }
    if (url.pathname.endsWith("/verify")) {
      const artifactHash = input.artifact_hash, approvalDigest = input.approval_digest;
      if (typeof artifactHash !== "string" || !/^[a-f0-9]{64}$/.test(artifactHash) ||
          typeof approvalDigest !== "string" || !/^[a-f0-9]{64}$/.test(approvalDigest)) {
        return response({ verified: false, reason: "approval_reference_invalid" }, 400);
      }
      const contract = normalizeContract(input.contract);
      const expectedDigest = await hash(stable({ schema: "jarvis.tool-approval.v1", artifactHash, contract }));
      const contractHash = await hash(stable(contract));
      if (expectedDigest !== approvalDigest) return response({ verified: false, reason: "artifact_or_contract_changed" }, 200);
      const query = new URLSearchParams({ select: "id,created_at,revoked_at", user_id: "eq." + user.id,
        artifact_hash: "eq." + artifactHash, approval_digest: "eq." + approvalDigest,
        contract_hash: "eq." + contractHash, revoked_at: "is.null", limit: "1" });
      const found = await rest("ai_builder_l3_approvals?" + query);
      if (!found.ok) { await found.text(); return response({ error: "approval_lookup_failed" }, 503); }
      const rows = await found.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      return response({ verified: Boolean(row), approval_id: row?.id ?? null, artifact_hash: artifactHash,
        approval_digest: approvalDigest, actor: row ? user.id : null, approved_at: row?.created_at ?? null });
    }
    if (url.pathname.endsWith("/revoke")) {
      if (typeof input.approval_id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.approval_id)) return response({ error: "approval_id_invalid" }, 400);
      const query = new URLSearchParams({ id: "eq." + input.approval_id, user_id: "eq." + user.id, revoked_at: "is.null" });
      const result = await rest("ai_builder_l3_approvals?" + query, {
        method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ revoked_at: new Date().toISOString() })
      });
      if (!result.ok) { await result.text(); return response({ error: "approval_revoke_failed" }, 503); }
      const rows = await result.json().catch(() => []);
      return response({ revoked: Array.isArray(rows) && rows.length > 0 });
    }
    return response({ error: "unknown_approval_action" }, 404);
  } catch (error) {
    const message = error instanceof Error && /^approval_[a-z0-9_]+$/.test(error.message) ? error.message : "approval_service_unavailable";
    return response({ error: message }, 503);
  }
});
