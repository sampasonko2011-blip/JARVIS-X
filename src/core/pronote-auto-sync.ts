import type { CalendarEvent } from "./icalendar.js";

export const PRONOTE_AUTO_SYNC_ID = "pronote.auto-sync" as const;

export type PronoteSyncStatus = "idle" | "syncing" | "success" | "session_expired" | "network_error" | "rejected";
export type PronoteDataFreshness = "fresh" | "stale" | "unknown";

export interface PronoteSnapshot {
  schemaVersion: "pronote.snapshot.v1";
  source: "pronote";
  generatedAt: string;
  events: CalendarEvent[];
  last_successful_sync: string | null;
  sync_status: PronoteSyncStatus;
  data_freshness: PronoteDataFreshness;
  last_attempt_at: string | null;
}

export interface PronoteSyncOptions {
  endpoint: string;
  allowedHosts: string[];
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  staleAfterMs?: number;
}

export function evaluatePronoteFreshness(lastSuccessfulSync: string | null, now = new Date(), staleAfterMs = 24 * 60 * 60 * 1000): PronoteDataFreshness {
  if (!lastSuccessfulSync) return "unknown";
  const stamp = Date.parse(lastSuccessfulSync);
  if (!Number.isFinite(stamp) || stamp > now.getTime()) return "unknown";
  return now.getTime() - stamp <= staleAfterMs ? "fresh" : "stale";
}

export function createPronoteSnapshot(events: CalendarEvent[], options: {
  generatedAt?: string;
  lastSuccessfulSync?: string | null;
  now?: Date;
  staleAfterMs?: number;
} = {}): PronoteSnapshot {
  const now = options.now ?? new Date();
  const generatedAt = options.generatedAt ?? now.toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) throw new TypeError("pronote_snapshot_generated_at_invalid");
  if (!Array.isArray(events) || events.length > 5000) throw new TypeError("pronote_snapshot_events_invalid");
  if (new Set(events.map(event => event?.uid)).size !== events.length) throw new TypeError("pronote_snapshot_duplicate_event");
  for (const event of events) {
    if (!event || typeof event.uid !== "string" || !event.uid || typeof event.start !== "string" || typeof event.end !== "string" ||
        !Number.isFinite(Date.parse(event.start)) || !Number.isFinite(Date.parse(event.end)) || Date.parse(event.end) <= Date.parse(event.start)) {
      throw new TypeError("pronote_snapshot_event_invalid");
    }
  }
  const lastSuccessful = options.lastSuccessfulSync ?? null;
  return {
    schemaVersion: "pronote.snapshot.v1",
    source: "pronote",
    generatedAt,
    events: structuredClone(events),
    last_successful_sync: lastSuccessful,
    sync_status: "idle",
    data_freshness: evaluatePronoteFreshness(lastSuccessful, now, options.staleAfterMs),
    last_attempt_at: null
  };
}

async function idempotencyKey(snapshot: PronoteSnapshot): Promise<string> {
  const identity = JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    eventIds: snapshot.events.map(event => event.uid).sort()
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function approvedEndpoint(endpoint: string, allowedHosts: string[]): URL | null {
  try {
    const url = new URL(endpoint);
    const hosts = new Set(allowedHosts.map(host => host.trim().toLowerCase()).filter(Boolean));
    if (url.protocol !== "https:" || url.username || url.password || !hosts.has(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Sends a caller-supplied local PRONOTE snapshot to an explicitly allowlisted HTTPS endpoint.
 * It does not log credentials, scrape PRONOTE, persist tokens, retry, or modify a calendar.
 */
export async function pushPronoteSnapshot(snapshot: PronoteSnapshot, options: PronoteSyncOptions): Promise<PronoteSnapshot> {
  const now = options.now ?? (() => new Date());
  const attemptedAt = now().toISOString();
  const base: PronoteSnapshot = {
    ...structuredClone(snapshot),
    sync_status: "syncing",
    last_attempt_at: attemptedAt,
    data_freshness: evaluatePronoteFreshness(snapshot.last_successful_sync, now(), options.staleAfterMs)
  };
  const endpoint = approvedEndpoint(options.endpoint, options.allowedHosts);
  if (!endpoint) return { ...base, sync_status: "rejected" };

  let token: string | null;
  try {
    token = await options.getAccessToken();
  } catch {
    return { ...base, sync_status: "session_expired" };
  }
  if (typeof token !== "string" || !token.trim()) return { ...base, sync_status: "session_expired" };

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + token,
        "idempotency-key": await idempotencyKey(snapshot)
      },
      body: JSON.stringify(base),
      redirect: "error",
      cache: "no-store"
    });
    if (response.status === 401 || response.status === 403) return { ...base, sync_status: "session_expired" };
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return { ...base, sync_status: "network_error" };
    }
    if (!response.ok) return { ...base, sync_status: "rejected" };
    const completedAt = now().toISOString();
    return {
      ...base,
      sync_status: "success",
      last_successful_sync: completedAt,
      data_freshness: "fresh"
    };
  } catch {
    return { ...base, sync_status: "network_error" };
  }
}
