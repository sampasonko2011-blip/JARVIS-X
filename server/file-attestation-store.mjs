import { readFile, stat } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";

/**
 * Load signed evidence from a server-local JSON file.
 *
 * This is a read-only trust boundary, not an evidence issuer. Operators must
 * populate the file only from a controlled evaluator/approval process and sign
 * each record with the server-held JX_ATTESTATION_HMAC_KEY. Never write it
 * from HTTP request data or model output.
 */
export function createFileAttestationLoader({
  path = process.env.JX_ATTESTATIONS_PATH,
  maxBytes = 2 * 1024 * 1024,
} = {}) {
  if (typeof path !== "string" || !path.trim() || !isAbsolute(path) ||
      !Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("ATTESTATION_STORE_PATH_MUST_BE_ABSOLUTE");
  }
  const trustedPath = resolve(path);

  return async function loadAttestations() {
    const info = await stat(trustedPath);
    if (!info.isFile() || info.size > maxBytes) {
      throw new Error("ATTESTATION_STORE_INVALID");
    }
    // On POSIX hosts, reject files writable by group or others. On platforms
    // without meaningful POSIX mode bits, deployment ACLs remain the boundary.
    if (process.platform !== "win32" && (info.mode & 0o022) !== 0) {
      throw new Error("ATTESTATION_STORE_PERMISSIONS_TOO_OPEN");
    }
    const raw = await readFile(trustedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("ATTESTATION_STORE_ARRAY_REQUIRED");
    return parsed;
  };
}
