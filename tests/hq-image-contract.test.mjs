import test from "node:test";
import assert from "node:assert/strict";
import { validateImageRequest, validateGeneratedAsset } from "../hq/image-contract.mjs";

test("image requests require explicit confirmation and bounded valid parameters", () => {
  const base = { prompt: "A stylized football tactics board", aspectRatio: "16:9", outputFormat: "png", count: 1, userConfirmed: true };
  const valid = validateImageRequest(base);
  assert.equal(valid.valid, true);
  assert.match(valid.limitation, /No provider has been invoked/);
  assert.equal(validateImageRequest({ ...base, userConfirmed: false }).reason, "EXPLICIT_USER_CONFIRMATION_REQUIRED");
  assert.equal(validateImageRequest({ ...base, count: 5 }).reason, "INVALID_OUTPUT_COUNT");
  assert.equal(validateImageRequest({ ...base, aspectRatio: "custom" }).reason, "UNSUPPORTED_ASPECT_RATIO");
  assert.equal(validateImageRequest({ ...base, prompt: " " }).reason, "PROMPT_REQUIRED");
});

test("generated image metadata requires provenance, size, hash, and timestamp", () => {
  const asset = {
    providerId: "provider-test",
    modelId: "model-test",
    assetId: "asset-test",
    mimeType: "image/png",
    byteLength: 1024,
    contentHash: "a".repeat(64),
    createdAt: "2026-10-23T12:00:00Z",
  };
  const valid = validateGeneratedAsset(asset);
  assert.equal(valid.valid, true);
  assert.equal(valid.asset.contentHash, "a".repeat(64));
  assert.match(valid.limitation, /Metadata validation only/);
  assert.equal(validateGeneratedAsset({ ...asset, mimeType: "text/html" }).reason, "UNSUPPORTED_MIME_TYPE");
  assert.equal(validateGeneratedAsset({ ...asset, byteLength: 0 }).reason, "INVALID_ASSET_SIZE");
  assert.equal(validateGeneratedAsset({ ...asset, contentHash: "not-a-hash" }).reason, "CONTENT_HASH_REQUIRED");
});
