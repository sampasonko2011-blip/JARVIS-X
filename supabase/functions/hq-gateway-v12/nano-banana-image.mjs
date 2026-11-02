/**
 * Nano Banana image-generation capability adapter for JARVIS-X.
 *
 * This is a capability, not a reasoning route or second assistant.
 * No API call occurs until generate() is explicitly invoked by an authorized
 * server route. The caller must enforce authentication, consent, and a budget.
 */
export const NANO_BANANA_MODEL = "gemini-nano-banana-2.1";
const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MAX_PROMPT_CHARS = 8000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ASPECT_RATIOS = new Set(["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16", "21:9"]);
const FORMATS = Object.freeze({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" });

function decodeBase64(value) {
  if (typeof value !== "string" || !value || value.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("image_output_base64_invalid");
  }
  let binary;
  try { binary = atob(value); } catch { throw new Error("image_output_base64_invalid"); }
  if (!binary.length || binary.length > MAX_IMAGE_BYTES) throw new Error("image_output_size_invalid");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function verifyImageSignature(bytes, mimeType) {
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (mimeType === "image/png" && !starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) throw new Error("image_output_signature_invalid");
  if (mimeType === "image/jpeg" && !starts(0xff, 0xd8, 0xff)) throw new Error("image_output_signature_invalid");
  if (mimeType === "image/webp" && !(String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")) throw new Error("image_output_signature_invalid");
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function validateNanoBananaRequest(request = {}) {
  if (typeof request.prompt !== "string" || !request.prompt.trim()) return { valid: false, reason: "PROMPT_REQUIRED" };
  if (request.prompt.length > MAX_PROMPT_CHARS) return { valid: false, reason: "PROMPT_TOO_LONG" };
  if (!ASPECT_RATIOS.has(request.aspectRatio)) return { valid: false, reason: "ASPECT_RATIO_INVALID" };
  if (!Object.hasOwn(FORMATS, request.outputFormat)) return { valid: false, reason: "OUTPUT_FORMAT_INVALID" };
  if (request.count !== 1) return { valid: false, reason: "ONE_IMAGE_PER_REQUEST_REQUIRED" };
  if (request.userConfirmed !== true) return { valid: false, reason: "EXPLICIT_USER_CONFIRMATION_REQUIRED" };
  return { valid: true, request: { prompt: request.prompt.trim(), aspectRatio: request.aspectRatio, outputFormat: request.outputFormat } };
}

/** @param {{ apiKey: string, fetchImpl?: typeof fetch, model?: string }} options */
export function createNanoBananaImageGenerator({ apiKey, fetchImpl = fetch, model = NANO_BANANA_MODEL } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("image_provider_credential_missing");
  if (model !== NANO_BANANA_MODEL) throw new Error("image_model_not_allowlisted");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch_implementation_required");

  return Object.freeze({
    async generate(request) {
      const checked = validateNanoBananaRequest(request);
      if (!checked.valid) throw new Error("image_request_" + checked.reason.toLowerCase());
      const { prompt, aspectRatio, outputFormat } = checked.request;
      const mimeType = FORMATS[outputFormat];
      const response = await fetchImpl(API_URL, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({
          model: NANO_BANANA_MODEL,
          input: prompt,
          response_format: { type: "image", mime_type: mimeType, aspect_ratio: aspectRatio, image_size: "1K" }
        })
      });
      if (!response.ok) throw new Error("image_provider_http_" + response.status);
      const interaction = await response.json().catch(() => null);
      const output = interaction?.output_image;
      if (typeof interaction?.id !== "string" || !interaction.id.trim()) throw new Error("image_provider_receipt_missing");
      if (!output || typeof output.data !== "string") throw new Error("image_provider_output_missing");
      if (output.mime_type !== mimeType) throw new Error("image_provider_mime_mismatch");
      const bytes = decodeBase64(output.data);
      verifyImageSignature(bytes, mimeType);
      const contentHash = await sha256(bytes);
      return Object.freeze({
        providerId: "google-gemini",
        modelId: NANO_BANANA_MODEL,
        assetId: interaction.id,
        mimeType,
        byteLength: bytes.byteLength,
        contentHash,
        createdAt: new Date().toISOString(),
        data: output.data,
        dataUrl: "data:" + mimeType + ";base64," + output.data,
      });
    }
  });
}
