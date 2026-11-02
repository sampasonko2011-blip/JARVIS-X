import test from "node:test";
import assert from "node:assert/strict";
import { createNanoBananaImageGenerator, NANO_BANANA_MODEL, validateNanoBananaRequest } from "../supabase/functions/hq-gateway-v12/nano-banana-image.mjs";

const png = "iVBORw0KGgo=";

test("Nano Banana adapter requires explicit confirmation and bounded one-image requests", () => {
  const base = { prompt: "A clean original illustration", aspectRatio: "16:9", outputFormat: "png", count: 1, userConfirmed: true };
  assert.equal(validateNanoBananaRequest(base).valid, true);
  assert.equal(validateNanoBananaRequest({ ...base, userConfirmed: false }).reason, "EXPLICIT_USER_CONFIRMATION_REQUIRED");
  assert.equal(validateNanoBananaRequest({ ...base, count: 2 }).reason, "ONE_IMAGE_PER_REQUEST_REQUIRED");
  assert.equal(validateNanoBananaRequest({ ...base, aspectRatio: "custom" }).reason, "ASPECT_RATIO_INVALID");
  assert.equal(validateNanoBananaRequest({ ...base, prompt: " " }).reason, "PROMPT_REQUIRED");
});

test("Nano Banana adapter is server-credentialed and allowlists one exact model", () => {
  assert.throws(() => createNanoBananaImageGenerator({ apiKey: "" }), /credential_missing/);
  assert.throws(() => createNanoBananaImageGenerator({ apiKey: "secret", model: "another-model" }), /not_allowlisted/);
  assert.equal(NANO_BANANA_MODEL, "gemini-nano-banana-2.1");
});

test("Nano Banana adapter invokes the documented Interactions API and validates the returned asset", async () => {
  let observed;
  const generator = createNanoBananaImageGenerator({
    apiKey: "server-only-test-key",
    fetchImpl: async (url, init) => {
      observed = { url, headers: init.headers, body: JSON.parse(init.body), method: init.method };
      return new Response(JSON.stringify({
        id: "interaction-test-1",
        output_image: { mime_type: "image/png", data: png }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const result = await generator.generate({ prompt: "A test image", aspectRatio: "16:9", outputFormat: "png", count: 1, userConfirmed: true });
  assert.equal(observed.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(observed.method, "POST");
  assert.equal(observed.headers["x-goog-api-key"], "server-only-test-key");
  assert.equal(observed.body.model, NANO_BANANA_MODEL);
  assert.equal(observed.body.response_format.image_size, "1K");
  assert.equal(result.assetId, "interaction-test-1");
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.byteLength, 8);
  assert.equal(result.data, png);
  assert.equal(result.contentHash.length, 64);
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
});

test("Nano Banana adapter fails closed on provider errors, missing output, MIME mismatch, and non-image bytes", async () => {
  const make = (response) => createNanoBananaImageGenerator({ apiKey: "test", fetchImpl: async () => response });
  const request = { prompt: "test", aspectRatio: "1:1", outputFormat: "png", count: 1, userConfirmed: true };
  await assert.rejects(make(new Response("{}", { status: 429 })).generate(request), /image_provider_http_429/);
  await assert.rejects(make(new Response(JSON.stringify({ id: "x" }), { status: 200 })).generate(request), /output_missing/);
  await assert.rejects(make(new Response(JSON.stringify({ id: "x", output_image: { mime_type: "image/jpeg", data: png } }), { status: 200 })).generate(request), /mime_mismatch/);
  await assert.rejects(make(new Response(JSON.stringify({ id: "x", output_image: { mime_type: "image/png", data: "aGVsbG8=" } }), { status: 200 })).generate(request), /signature_invalid/);
});
