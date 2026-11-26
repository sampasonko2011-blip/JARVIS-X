import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "hq");
const output = path.join(root, "dist", "hq-p5-safe-preview");
const allowlist = [
  "index.html","hq.css","hq.js","manifest.webmanifest","icon.svg",
  "p4-perception.css","p4-perception.bundle.mjs","pdf.worker.bundle.mjs",
  "neural-observatory.css","neural-observatory.js",
  "conversation-experience.css","conversation-experience.js",
  "audio-full-duplex.css","audio-full-duplex.js","audio-session.mjs",
  "arrival-experience.css","arrival-experience.js",
  "observatory-premium.css","kardashev-hud.css","kardashev-engine.js",
  "spatial-liquid-hud.css","spatial-liquid-hud.js","workspace-calendar.js",
  "pronote-ipad-bridge.js","p5-console.mjs","offline-sync-queue.mjs",
  "crdt-lww-set.mjs","l3-evolution-gate.mjs","forge.js",
  "observatory.html","observatory.css","observatory.js","observatory-v29.js",
  "v54-harmony.css","v54-harmony-core.js","v54-observatory.js",
  "interstellar-v30.css","interstellar-v30.js","interstellar-v31.css",
  "interstellar-v32.css","observatory-v31.js","observatory-v32.js",
  "spatial-mode.css","spatial-mode.js",
  "local-chat.html","local-chat-preflight.html","local-chat-preflight.js",
  "local-chat-sw-register.js","local-chat-engine.bundle.js","jarvis-brain-v36.js",
  "local-chat-v33.css","local-chat-v33.js","local-chat-v34.css","local-chat-v34.js",
  "local-chat-v35.css","local-chat-v35.js","local-chat-v38.css","local-chat-v38.js",
  "local-chat-v42.css","local-chat-v42.js","v46-apex.css","v46-apex.js"
];

if (existsSync(output)) rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const missing = allowlist.filter((name) => !existsSync(path.join(source, name)));
if (missing.length) throw new Error("PREVIEW_ALLOWLIST_MISSING: " + missing.join(", "));

for (const name of allowlist) cpSync(path.join(source, name), path.join(output, name));

const strictCsp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; manifest-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
const htmlFiles = allowlist.filter((name) => name.endsWith(".html"));
for (const name of htmlFiles) {
  let html = readFileSync(path.join(output, name), "utf8");
  const cspMeta = '<meta http-equiv="Content-Security-Policy" content="' + strictCsp + '">';
  if (/<meta http-equiv=["']Content-Security-Policy["'][^>]*>/i.test(html)) {
    html = html.replace(/<meta http-equiv=["']Content-Security-Policy["'][^>]*>/i, cspMeta);
  } else {
    html = html.replace(/<head[^>]*>/i, (head) => head + cspMeta);
  }
  html = html.replace(/<a\b[^>]*href=["']\/JARVIS-X\/career\/["'][^>]*>[\s\S]*?<\/a>/gi,
    '<span class="hq-mission-link" aria-disabled="true">Football mission · excluded from isolated preview</span>');
  html = html.replace(/<a\b([^>]*?)href=["']\.\.\/docs\/[^"']+["']([^>]*)>[\s\S]*?<\/a>/gi,
    '<span class="footnote">Internal technical document excluded from isolated preview.</span>');
  html = html.replace(/<a\b[^>]*href=["']\.\/mission-control\.html["'][^>]*>[\s\S]*?<\/a>/gi,
    '<span aria-disabled="true">Mission Control · excluded from isolated preview</span>');
  html = html.replace(/https:\/\/xfewajxkqntflfntisut\.supabase\.co/gi, "https://preview-network-disabled.invalid");
  writeFileSync(path.join(output, name), html);
}

// A preview-specific worker is essential: CacheStorage is shared by origin.
// It must never delete or overwrite the production HQ cache namespace.
const shell = allowlist.map((name) => "./" + name);
const worker = `const CACHE = "jarvis-x-p5-safe-preview-v1";
const SHELL = ${JSON.stringify(shell, null, 2)};
const scopeUrl = new URL("./", self.registration.scope);
const allowed = new Set(SHELL.map((asset) => new URL(asset, scopeUrl).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(SHELL.map((asset) => new URL(asset, scopeUrl).href)))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key.startsWith("jarvis-x-p5-safe-preview-") && key !== CACHE)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !allowed.has(url.pathname)) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => {
    if (cached) return cached;
    return fetch(request);
  }));
});
`;
writeFileSync(path.join(output, "sw.js"), worker);

// Validate every local HTML reference and CSS url() before producing the artifact.
const missingRefs = [];
for (const name of htmlFiles) {
  const html = readFileSync(path.join(output, name), "utf8");
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi)) {
    const ref = match[1].split("?")[0];
    if (/^(?:https?:|data:|mailto:|tel:|\/|#)/i.test(ref)) continue;
    const resolved = path.resolve(output, ref);
    if (!resolved.startsWith(output + path.sep) && resolved !== output) continue;
    if (!existsSync(resolved)) missingRefs.push(name + " -> " + ref);
  }
}
for (const name of allowlist.filter((file) => file.endsWith(".css"))) {
  const css = readFileSync(path.join(output, name), "utf8");
  for (const match of css.matchAll(/url\((?:["']?)([^)"']+)(?:["']?)\)/gi)) {
    const ref = match[1].trim();
    if (/^(?:https?:|data:|blob:|#)/i.test(ref)) continue;
    const resolved = path.resolve(output, path.dirname(name), ref.split("?")[0]);
    if (!resolved.startsWith(output + path.sep) && resolved !== output) continue;
    if (!existsSync(resolved)) missingRefs.push(name + " -> " + ref);
  }
}
if (missingRefs.length) throw new Error("PREVIEW_DEPENDENCY_MISSING: " + missingRefs.join("; "));

const files = [...allowlist, "sw.js"].map((name) => {
  const bytes = readFileSync(path.join(output, name));
  return { path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
});
const manifest = {
  schema: "jarvis-x.safe-preview.v1",
  source_ref: process.env.GITHUB_SHA || "local",
  policy: {
    network: "same-origin only; Supabase and model-host connections blocked by CSP",
    auth: "not configured; no secrets included",
    service_worker_cache_namespace: "jarvis-x-p5-safe-preview-v1",
    excluded: ["career workspace", "Mission Control", "internal docs", "roadmaps", "migration files", "OAuth callback", "source-only and unused legacy modules"]
  },
  file_count: files.length,
  files
};
writeFileSync(path.join(output, "preview-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ output, file_count: files.length, total_bytes: files.reduce((sum, file) => sum + file.bytes, 0), manifest: "preview-manifest.json", service_worker_cache_namespace: "jarvis-x-p5-safe-preview-v1" }, null, 2));
