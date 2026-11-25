const MAX_EVENTS = 2_000;
const MAX_SNAPSHOT_BYTES = 2_000_000;
const EVENT_KINDS = new Set(["school", "homework", "assessment", "football_training", "football_match", "other"]);

export function validatePronoteSnapshot(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["snapshot_must_be_object"] };
  if (value.schemaVersion !== "pronote.snapshot.v1" || value.source !== "pronote") errors.push("snapshot_schema_or_source_invalid");
  if (typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))) errors.push("snapshot_generated_at_invalid");
  if (!Array.isArray(value.events) || value.events.length > MAX_EVENTS) errors.push("snapshot_events_invalid");
  if (Array.isArray(value.events)) {
    const ids = new Set();
    for (const event of value.events) {
      if (!event || typeof event !== "object" || Array.isArray(event)) { errors.push("snapshot_event_invalid"); break; }
      if (typeof event.uid !== "string" || !event.uid.trim() || event.uid.length > 256 || ids.has(event.uid)) {
        errors.push("snapshot_event_uid_invalid_or_duplicate"); break;
      }
      ids.add(event.uid);
      if (typeof event.summary !== "string" || event.summary.length > 1_000 ||
          typeof event.description !== "string" || event.description.length > 5_000 ||
          !EVENT_KINDS.has(event.kind) ||
          typeof event.start !== "string" || !Number.isFinite(Date.parse(event.start)) ||
          typeof event.end !== "string" || !Number.isFinite(Date.parse(event.end)) ||
          Date.parse(event.end) <= Date.parse(event.start) ||
          typeof event.allDay !== "boolean" || event.source !== "pronote" ||
          typeof event.timezone !== "string" || event.timezone.length > 80 ||
          typeof event.recurrenceInstance !== "boolean") {
        errors.push("snapshot_event_fields_invalid"); break;
      }
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > MAX_SNAPSHOT_BYTES) errors.push("snapshot_body_too_large");
  return { valid: errors.length === 0, errors };
}
export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
export function canonicalSnapshot(snapshot) {
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    source: snapshot.source,
    generatedAt: snapshot.generatedAt,
    events: [...snapshot.events].sort((a, b) => a.uid.localeCompare(b.uid))
  });
}
