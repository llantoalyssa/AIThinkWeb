"client-only";

// ============================================================
// Client-side OCR for scanned / image-only journal PDFs.
//
// Used ONLY for pages whose native text layer is thin or empty — the caller
// (components/department-journals.tsx) asks the server for PER-PAGE text and
// sends just the pages that need it here. That is what makes a MIXED document
// work: pages with a real text layer keep their PDF text (no OCR, no duplicate
// words) and only the scanned pages are recognised.
//
// Pipeline per page:
//   1. PDF.js renders the page to a canvas at a resolution derived from the
//      page's own width (~1800 px, clamped) instead of a fixed 2× — a narrow
//      journal page and a wide two-column paper need different scales to give
//      Tesseract comparable glyph sizes.
//   2. The canvas becomes GRAYSCALE with a contrast stretch. Faint scans on grey
//      paper are the common failure; this recovers them without full
//      binarisation, which destroys anti-aliased small text.
//   3. ONE Tesseract worker recognises every page (a worker per page was the old
//      cost), configured for documents: automatic page segmentation so columns
//      are not read across, and interword spaces preserved so prose does not
//      fuse into one token.
//   4. The worker and the PDF document are released in `finally`, so a failure
//      on page 3 cannot leak a WASM worker for the rest of the session.
//
// Workers load from CDN because Next's bundler does not ship PDF.js's and
// Tesseract's worker files to a predictable path; uploads are low-frequency.
// ============================================================

import { createWorker, PSM } from "tesseract.js";

/** A page with fewer characters than this has no usable text layer. */
export const PAGE_TEXT_MIN_CHARS = 40;

// CDN worker for PDF.js (version-matched to the installed package).
// jsDelivr mirrors the exact npm version, guaranteeing the file exists.
const PDFJS_VERSION = "6.3.289";
const WORKER_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

/** Target rendered width in px — Tesseract wants ~300 DPI for body text. */
const TARGET_RENDER_WIDTH = 1800;
const MIN_SCALE = 1.5;
const MAX_SCALE = 3;

export type OcrOptions = {
  /** 1-based page numbers to recognise. Omitted/empty → every page. */
  pages?: number[];
};

export type OcrPageText = { page: number; text: string };

/**
 * OCR the requested pages and return ONE ENTRY PER PAGE, in page order.
 *
 * Page-level results (rather than one blob) are what lets the caller put each
 * recognised page back where it came from, so a mixed document keeps its native
 * text on the pages that had it and gains OCR only on the scanned ones.
 */
export async function ocrPdfPages(
  file: File,
  opts?: OcrOptions,
): Promise<OcrPageText[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_CDN;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  const wanted =
    opts?.pages && opts.pages.length > 0
      ? opts.pages
      : Array.from({ length: pdf.numPages }, (_, i) => i + 1);

  const images: { page: number; url: string }[] = [];

  try {
    for (const pageNumber of wanted) {
      if (pageNumber < 1 || pageNumber > pdf.numPages) continue;
      const page = await pdf.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, TARGET_RENDER_WIDTH / Math.max(base.width, 1)),
        );
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        // pdfjs 6.x renders straight into the canvas element.
        await page.render({ canvas, viewport }).promise;

        images.push({ page: pageNumber, url: grayscaleStretch(canvas) });
        // Release the backing store immediately — twenty 1800px pages kept
        // alive is hundreds of MB.
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        // cleanup() is sync in some builds and a promise in others — never let
        // it mask the real error.
        try {
          await page.cleanup();
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    try {
      await pdf.cleanup();
    } catch {
      /* ignore */
    }
  }

  if (images.length === 0) return [];

  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      // Automatic page segmentation: a journal page may be one column, two
      // columns, or prose with a sidebar. The default (single block) reads
      // straight across the gutter.
      tessedit_pageseg_mode: PSM.AUTO,
      // Keep runs of spaces, so a column gutter survives as a word boundary
      // instead of gluing the last word of one column to the first of the next.
      preserve_interword_spaces: "1",
    });

    const parts: OcrPageText[] = [];
    for (const image of images) {
      const { data: result } = await worker.recognize(image.url);
      const text = (result.text || "")
        .replace(/\r\n/g, "\n")
        // Tesseract pads every line; keep the breaks, drop the padding.
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (text) parts.push({ page: image.page, text });
    }

    return parts;
  } finally {
    // Always free the worker: it holds a WASM runtime and is unusable after a
    // rejected promise.
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Convenience wrapper: every recognised page as one string, pages separated by
 * a blank line. Use `ocrPdfPages` when the page a block came from matters.
 */
export async function ocrPdfFile(file: File, opts?: OcrOptions): Promise<string> {
  const pages = await ocrPdfPages(file, opts);
  return pages
    .map((entry) => entry.text)
    .join("\n\n")
    .trim();
}

/**
 * Grayscale + contrast stretch, in place on a canvas, returning a PNG data URL.
 *
 * A scanned page is usually mid-grey paper with slightly darker ink; Tesseract
 * does far better when that narrow range is spread across 0–255. The stretch is
 * computed from the 1st/99th percentile so a stray black border cannot flatten
 * the whole page.
 */
function grayscaleStretch(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");

  const { width, height } = canvas;
  if (width === 0 || height === 0) return canvas.toDataURL("image/png");

  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;

  const histogram = new Uint32Array(256);
  const grays = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    const gray =
      (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) | 0;
    grays[p] = gray;
    if (p % 3 === 0) histogram[gray]++;
  }

  const total = Math.ceil(grays.length / 3);
  let low = 0;
  let high = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += histogram[v];
    if (acc > total * 0.01) {
      low = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += histogram[v];
    if (acc > total * 0.01) {
      high = v;
      break;
    }
  }

  // A page already at full contrast needs no stretch (stretching it would only
  // amplify compression noise).
  const span = Math.max(high - low, 1);
  const needsStretch = span < 200;

  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    let value = grays[p];
    if (needsStretch) {
      value = ((value - low) * 255) / span;
      value = value < 0 ? 0 : value > 255 ? 255 : value;
    }
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Whether a PAGE's text is too thin to be useful — the signal the caller uses to
 * decide WHICH pages to OCR. One named rule, so the server extractor and the
 * upload UI cannot disagree about the threshold.
 */
export function pageNeedsOcr(pageText: string): boolean {
  return (pageText || "").trim().length < PAGE_TEXT_MIN_CHARS;
}

/** Whether OCR is worth running for a whole document (no per-page info). */
export function shouldOcr(extractedText: string): boolean {
  return pageNeedsOcr(extractedText);
}
