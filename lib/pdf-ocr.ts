"client-only";
import { createWorker } from "tesseract.js";

const TEXT_MIN_LENGTH = 50;
const PDFJS_VERSION = "6.3.289";
const WORKER_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export async function ocrPdfFile(file: File): Promise<string> {

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_CDN;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  const scale = 2;
  const images: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    await page.render({ canvas, viewport }).promise;
    images.push(canvas.toDataURL("image/png"));
  }
  await (pdf as { cleanup?: () => Promise<void> }).cleanup?.();

  if (images.length === 0) return "";
  const worker = await createWorker("eng");
  const parts: string[] = [];
  for (const img of images) {
    const { data } = await worker.recognize(img);
    parts.push(data.text || "");
  }
  await worker.terminate();

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function shouldOcr(extractedText: string): boolean {
  return (extractedText || "").trim().length < TEXT_MIN_LENGTH;
}