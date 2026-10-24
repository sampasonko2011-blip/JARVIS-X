# JARVIS-X HQ Release Audit

Audit date: 2026-10-24  
Scope: development branch `feature/jx-composite-runtime-bridge-clean`, PR #47.  
Decision: **NOT RELEASE-READY**. Keep PR in draft. No merge or public deployment is authorized by this document.

## Evidence ledger

| Area | Status | Evidence / limitation |
|---|---|---|
| HQ app shell | OBSERVED | `hq/index.html`, PWA manifest, service worker, and iOS home-screen metadata are present on the feature branch. |
| Hosted gateway | OBSERVED | Supabase reports `hq-gateway` ACTIVE, version 10, JWT verification enabled. This does not prove a successful authenticated inference. |
| CI before latest consent change | VALIDATED | CI run #738 passed on commit `181ac9b3`; the tests include mocked gateway contracts. |
| CI after consent change | PENDING | Run #744 was in progress at the time of this audit. Check the workflow result before treating the latest changes as validated. |
| Cross-platform memory consent | IMPLEMENTED, CI PENDING | The HQ exposes an explicit checkbox; the gateway only recalls or stores memory when `memory_consent === true`. |
| XMemo API behavior | UNPROVEN | A real authenticated recall/write/recall cycle and per-user isolation test remain required. |
| Provider inference | UNPROVEN | No successful live authenticated browser-to-gateway inference has been established in this audit. |
| Execution audit write | UNPROVEN | Confirm a real run writes its content-minimized ledger record. |
| Rate-limit security | OPEN RISK | Supabase advisor flags authenticated EXECUTE on `public.consume_hq_rate_limit(p_limit_key text)`, a SECURITY DEFINER function. Review grants and abuse implications without breaking rate limiting. |
| Public HQ route | UNPROVEN / NOT RELEASED | Feature branch is not published; do not infer deployment from source code or CI. |
| Multi-model independence | NOT IMPLEMENTED IN CURRENT GATEWAY | Three sequential calls use the same configured primary model; this is self-critique, not independent model consensus. |

## Required release gates

1. Verify required Supabase Edge Function secrets in the Supabase dashboard without copying secret values into chat or repository files: `JX_ALLOWED_EMAILS`, `OPENAI_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Check `XMEMO_API_KEY` only if cross-platform memory is intentionally enabled.
2. Confirm the latest CI run passes, including the opt-in memory regression test.
3. Run a real authenticated chat request from the intended HQ origin and verify the returned provider/model and response.
4. Verify the content-minimized execution ledger row is written, with no prompt or response body persisted in the audit ledger.
5. With memory consent **off**, prove there is no XMemo recall or write. With consent **on**, prove a scoped write and a later recall; test two accounts to verify isolation.
6. Review and mitigate the rate-limit RPC warning and establish provider-side/global spend controls before any public release.
7. Verify GitHub Pages configuration and the actual published URL after authorized deployment.
8. Keep PR #47 in draft until all release gates pass and the repository owner explicitly authorizes publication.

## Safety and integrity rules

- Never place provider keys or service-role credentials in browser code, source control, logs, or chat.
- Treat retrieved memory as untrusted context; current instructions take precedence.
- A configured secret is not proof of working integration.
- Passing mocked tests is not proof of production behavior.
- Successful writes are not proof of durable recall.
- Do not merge or deploy based on this audit alone.
