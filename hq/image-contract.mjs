/**
 * Image Studio provider-neutral contract.
 * Validation only: no provider calls, network access, or image generation.
 */

const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]);
const ALLOWED_OUTPUT_FORMATS = new Set(["png", "jpeg", "webp"]);
const MAX_PROMPT_LENGTH = 8000;
const MAX_OUTPUTS = 4;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;

export function validateImageRequest(request = {}) {
  if (typeof request.prompt !== "string" || !request.prompt.trim()) {
    return { valid: false, reason: "PROMPT_REQUIRED" };
  }
  if (request.prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, reason: "PROMPT_TOO_LONG", maxLength: MAX_PROMPT_LENGTH };
  }
  if (!ALLOWED_ASPECT_RATIOS.has(request.aspectRatio)) {
    return { valid: false, reason: "UNSUPPORTED_ASPECT_RATIO" };
  }
  if (!ALLOWED_OUTPUT_FORMATS.has(request.outputFormat)) {
    return { valid: false, reason: "UNSUPPORTED_OUTPUT_FORMAT" };
  }
  if (!Number.isInteger(request.count) || request.count < 1 || request.count > MAX_OUTPUTS) {
    return { valid: false, reason: "INVALID_OUTPUT_COUNT", maxCount: MAX_OUTPUTS };
  }
  if (request.userConfirmed !== true) {
    return { valid: false, reason: "EXPLICIT_USER_CONFIRMATION_REQUIRED" };
  }
  return {
    valid: true,
    request: {
      prompt: request.prompt.trim(),
      aspectRatio: request.aspectRatio,
      outputFormat: request.outputFormat,
      count: request.count,
    },
    limitation: "Request validated only. No provider has been invoked and no image has been generated.",
  };
}

export function validateGeneratedAsset(asset = {}) {
  if (typeof asset.providerId !== "string" || !asset.providerId.trim()) {
    return { valid: false, reason: "PROVIDER_ID_REQUIRED" };
  }
  if (typeof asset.modelId !== "string" || !asset.modelId.trim()) {
    return { valid: false, reason: "MODEL_ID_REQUIRED" };
  }
  if (typeof asset.assetId !== "string" || !asset.assetId.trim()) {
    return { valid: false, reason: "ASSET_ID_REQUIRED" };
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mimeType)) {
    return { valid: false, reason: "UNSUPPORTED_MIME_TYPE" };
  }
  if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength < 1 || asset.byteLength > MAX_ASSET_BYTES) {
    return { valid: false, reason: "INVALID_ASSET_SIZE", maxBytes: MAX_ASSET_BYTES };
  }
  if (typeof asset.contentHash !== "string" || !/^[a-f0-9]{64}$/i.test(asset.contentHash)) {
    return { valid: false, reason: "CONTENT_HASH_REQUIRED" };
  }
  if (typeof asset.createdAt !== "string" || Number.isNaN(Date.parse(asset.createdAt))) {
    return { valid: false, reason: "INVALID_CREATED_AT" };
  }
  return {
    valid: true,
    asset: {
      providerId: asset.providerId,
      modelId: asset.modelId,
      assetId: asset.assetId,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
      contentHash: asset.contentHash.toLowerCase(),
      createdAt: asset.createdAt,
    },
    limitation: "Metadata validation only. Asset bytes, provider claims, consent, and storage durability require separate verification.",
  };
}
