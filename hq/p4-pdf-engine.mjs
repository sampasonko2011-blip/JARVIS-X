import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

if (typeof window !== "undefined") GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.bundle.mjs", import.meta.url).toString();

const MAX_PDF_PAGES = 80;
const MAX_PDF_TEXT_CHARS = 120000;

export async function extractPdfText(input, options = {}) {
  const maxPages = Math.min(MAX_PDF_PAGES, Math.max(1, Number(options.maxPages) || MAX_PDF_PAGES));
  const maxChars = Math.min(MAX_PDF_TEXT_CHARS, Math.max(1000, Number(options.maxChars) || MAX_PDF_TEXT_CHARS));
  const timeoutMs = Math.min(30000, Math.max(1000, Number(options.timeoutMs) || 15000));
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());
  if (bytes.byteLength < 8 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("PDF_SIGNATURE_INVALID");
  }
  let loadingTask;
  let timer;
  try {
    loadingTask = getDocument({
      data: bytes,
      isEvalSupported: false,
      useSystemFonts: true,
      disableAutoFetch: true,
      disableStream: true,
      stopAtErrors: true
    });
    const work = (async () => {
      const pdf = await loadingTask.promise;
      if (pdf.numPages > maxPages) throw new Error("PDF_PAGE_LIMIT_EXCEEDED");
      const pages = [];
      let length = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const line = content.items
          .filter(item => item && typeof item.str === "string")
          .map(item => item.str)
          .join(" ")
          .replace(/[\\t ]+/g, " ")
          .trim();
        if (line) {
          length += line.length + 1;
          if (length > maxChars) throw new Error("PDF_TEXT_LIMIT_EXCEEDED");
          pages.push(line);
        }
        page.cleanup();
      }
      const text = pages.join("\\n").trim();
      if (!text) throw new Error("PDF_TEXT_LAYER_UNAVAILABLE");
      return { text, pages: pdf.numPages, extractedPages: pages.length, characters: text.length, status: "PDF_TEXT_EXTRACTED_LOCAL" };
    })();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("PDF_EXTRACTION_TIMEOUT")), timeoutMs);
    });
    return await Promise.race([work, timeout]);
  } catch (error) {
    if (error instanceof Error && /^PDF_/.test(error.message)) throw error;
    throw new Error("PDF_PARSE_FAILED: " + String(error?.message || error));
  } finally {
    if (timer) clearTimeout(timer);
    if (loadingTask) {
      try { await loadingTask.destroy(); } catch {}
    }
  }
}
