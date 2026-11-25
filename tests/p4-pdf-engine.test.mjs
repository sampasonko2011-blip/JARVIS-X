import test from "node:test";
import assert from "node:assert/strict";
import { extractPdfText } from "../hq/p4-pdf-engine.mjs";

function makePdf(text) {
  const stream = text ? "BT /F1 16 Tf 20 80 Td (" + text + ") Tj ET" : "BT ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(stream) + " >>\nstream\n" + stream + "\nendstream"
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += (index + 1) + " 0 obj\n" + object + "\nendobj\n";
  });
  const xrefOffset = Buffer.byteLength(source);
  source += "xref\n0 6\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) source += String(offset).padStart(10, "0") + " 00000 n \n";
  source += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";
  return new Uint8Array(Buffer.from(source, "binary"));
}

test("PDF.js extracts a text-layer PDF locally with bounded metadata", async () => {
  const result = await extractPdfText(makePdf("Local PDF extraction works"));
  assert.match(result.text, /Local PDF extraction works/);
  assert.equal(result.pages, 1);
  assert.equal(result.status, "PDF_TEXT_EXTRACTED_LOCAL");
  assert.equal(result.extractedPages, 1);
});

test("scanned or textless PDF reports an explicit no-text-layer status", async () => {
  await assert.rejects(() => extractPdfText(makePdf("")), /PDF_TEXT_LAYER_UNAVAILABLE/);
});

test("PDF parser rejects invalid signatures", async () => {
  await assert.rejects(() => extractPdfText(new Uint8Array(Buffer.from("not a PDF"))), /PDF_SIGNATURE_INVALID/);
});
