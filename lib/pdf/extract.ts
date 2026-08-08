"use client";

import { PAGE_WIDTH_PX, THUMB_WIDTH_PX } from "@/lib/constants";

export type ExtractedPage = { pageId: string; full: Blob; thumb: Blob };

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsPromise;
}

const toWebp = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/webp", quality)
  );

async function finish(canvas: HTMLCanvasElement) {
  // 0.92 keeps photographic detail. 0.82 was visibly soft on gradients.
  const full = await toWebp(canvas, 0.92);

  const t = document.createElement("canvas");
  t.width = THUMB_WIDTH_PX;
  t.height = Math.max(1, Math.round(THUMB_WIDTH_PX * (canvas.height / canvas.width)));
  const tc = t.getContext("2d")!;
  tc.imageSmoothingQuality = "high";
  tc.drawImage(canvas, 0, 0, t.width, t.height);
  return { full, thumb: await toWebp(t, 0.8) };
}

export async function extractPdf(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<ExtractedPage[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: ExtractedPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const canvas = document.createElement("canvas");
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PAGE_WIDTH_PX / base.width });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;

    out.push({ pageId: crypto.randomUUID(), ...(await finish(canvas)) });
    onProgress?.(i, doc.numPages);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

export async function extractImages(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<ExtractedPage[]> {
  const out: ExtractedPage[] = [];

  for (let i = 0; i < files.length; i++) {
    const bitmap = await createImageBitmap(files[i]);

    // Never upscale: that invents pixels and inflates the upload. A photo
    // smaller than the target keeps its own resolution.
    const scale = Math.min(1, PAGE_WIDTH_PX / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    out.push({ pageId: crypto.randomUUID(), ...(await finish(canvas)) });
    onProgress?.(i + 1, files.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
