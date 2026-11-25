import { OfflineSyncQueue } from "./offline-sync-queue.mjs";
import { LwwElementSet } from "./crdt-lww-set.mjs";

const $ = (selector) => document.querySelector(selector);
const queue = (() => {
  try { return new OfflineSyncQueue(); } catch { return null; }
})();
const state = { ready: false };

function message(text, kind = "info") {
  const target = $("#p5-message");
  if (!target) return;
  target.textContent = text;
  target.dataset.state = kind;
}
function render(records) {
  const pending = records.filter((item) => item.status === "pending" || item.status === "sending").length;
  const synced = records.filter((item) => item.status === "synced").length;
  $("#p5-pending-count").textContent = String(pending);
  $("#p5-synced-count").textContent = String(synced);
  $("#p5-network-status").textContent = navigator.onLine ? "ONLINE · NO AUTO-SEND" : "OFFLINE";
  $("#p5-db-status").textContent = state.ready ? "AVAILABLE" : "UNAVAILABLE";
  const root = $("#p5-outbox");
  root.replaceChildren();
  if (!records.length) {
    const empty = document.createElement("p");
    empty.textContent = "Outbox empty. No mutation has been queued.";
    root.append(empty);
    return;
  }
  for (const item of records) {
    const row = document.createElement("div");
    row.className = "p5-outbox-item";
    const detail = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = item.type;
    const meta = document.createElement("small");
    meta.textContent = ` · ${item.status.toUpperCase()} · attempts ${item.attempts} · ${new Date(item.createdAt).toLocaleString()}`;
    detail.append(title, meta);
    const key = document.createElement("small");
    key.textContent = `ID ${item.id.slice(0, 12)} · idem ${item.idempotencyKey.slice(0, 18)}`;
    row.append(detail, key);
    root.append(row);
  }
}
async function refresh() {
  if (!queue) {
    state.ready = false;
    render([]);
    message("IndexedDB unavailable in this browser context. No data was queued.", "error");
    return;
  }
  try {
    const records = await queue.list();
    state.ready = true;
    render(records);
  } catch (error) {
    state.ready = false;
    render([]);
    message(`Local outbox unavailable: ${error.message}`, "error");
  }
}
$("#p5-enqueue")?.addEventListener("click", async () => {
  if (!queue) return refresh();
  try {
    const payload = JSON.parse($("#p5-payload").value);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Payload must be a JSON object.");
    const idempotencyKey = $("#p5-idempotency").value.trim() || undefined;
    const record = await queue.enqueue({ type: $("#p5-mutation-type").value, payload, idempotencyKey });
    message(record.duplicate ? "Duplicate idempotency key: existing item retained." : "Saved locally as PENDING. No network request was made.", "success");
    await refresh();
  } catch (error) {
    message(`Not queued: ${error.message}`, "error");
  }
});
$("#p5-refresh")?.addEventListener("click", refresh);
$("#p5-recover")?.addEventListener("click", async () => {
  if (!queue) return refresh();
  try {
    const count = await queue.recoverInterrupted();
    message(`Recovered ${count} interrupted send(s) to PENDING. Nothing was transmitted.`, "success");
    await refresh();
  } catch (error) { message(`Recovery failed: ${error.message}`, "error"); }
});
$("#p5-export")?.addEventListener("click", async () => {
  if (!queue) return refresh();
  try {
    const records = await queue.list();
    const blob = new Blob([JSON.stringify({ schema: "jarvis-x.p5-outbox.v1", exportedAt: new Date().toISOString(), records }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "jarvis-x-p5-outbox.json"; anchor.click();
    URL.revokeObjectURL(url);
    message("Local outbox export prepared. Treat the file as sensitive if its payloads contain personal data.", "success");
  } catch (error) { message(`Export failed: ${error.message}`, "error"); }
});
window.addEventListener("jx:memory-mutation", async (event) => {
  if (!queue) return message("Memory change was saved in HQ, but encrypted outbox is unavailable.", "error");
  const note = event.detail;
  if (!note || typeof note.id !== "string" || typeof note.title !== "string" || typeof note.body !== "string") return;
  try {
    const previous = (await queue.list()).filter((item) => item.type === "memory.note.crdt").at(-1);
    const crdt = new LwwElementSet({ actor: "hq-browser", state: previous?.payload?.crdt });
    const record = { id: note.id, title: note.title.slice(0, 240), body: note.body.slice(0, 12000), time: String(note.time ?? "") };
    crdt.add(record);
    await queue.enqueue({ type: "memory.note.crdt", idempotencyKey: `memory:${note.id}`, metadata: { source: "hq-local-memory", queuedAt: Date.now() }, payload: { record, crdt: crdt.export() } });
    message("HQ memory change encrypted and queued locally. No XMemo write or remote sync was performed.", "success");
    await refresh();
  } catch (error) { message(`Memory queue failed: ${error.message}`, "error"); }
});
window.addEventListener("jx:pronote-snapshot", async (event) => {
  if (!queue) return message("PRONOTE snapshot received, but encrypted local outbox is unavailable.", "error");
  const detail = event.detail || {};
  if (detail.schema_version !== "pronote.snapshot.v1" || !Array.isArray(detail.snapshot?.events)) return;
  try {
    const previous = (await queue.list()).filter((item) => item.type === "pronote.snapshot.crdt").at(-1);
    const crdt = new LwwElementSet({ actor: "hq-browser", state: previous?.payload?.crdt });
    const normalized = detail.snapshot.events.slice(0, 250).map((item, index) => ({
      id: String(item.id ?? item.event_id ?? [item.kind, item.start, item.summary, index].join(":")).slice(0, 240),
      kind: String(item.kind ?? "other").slice(0, 80),
      summary: String(item.summary ?? "Événement sans titre").slice(0, 1000),
      start: String(item.start ?? "").slice(0, 80),
      end: String(item.end ?? "").slice(0, 80)
    }));
    for (const item of normalized) crdt.add(item);
    const hash = String(detail.snapshot_hash ?? `local-${detail.generated_at ?? Date.now()}`).replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 120);
    await queue.enqueue({
      type: "pronote.snapshot.crdt",
      idempotencyKey: `pronote:${hash || Date.now()}`,
      metadata: { schema_version: detail.schema_version, generated_at: detail.generated_at ?? null, source: "authenticated-pronote-read" },
      payload: { schema_version: detail.schema_version, snapshot_hash: hash, events: normalized, crdt: crdt.export() }
    });
    message("Authenticated PRONOTE snapshot encrypted and queued locally. No remote write or sync was performed.", "success");
    await refresh();
  } catch (error) {
    message(`PRONOTE local queue failed: ${error.message}`, "error");
  }
});
window.addEventListener("online", refresh);
window.addEventListener("offline", refresh);
if (queue) {
  queue.recoverInterrupted().then(refresh).catch((error) => message(`Local recovery unavailable: ${error.message}`, "error"));
} else {
  refresh();
}
