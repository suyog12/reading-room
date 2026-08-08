"use client";

import {
  PAGE_WIDTH_PX, THUMB_WIDTH_PX, PAGE_BYTE_TARGET, QUALITY_LADDER,
  VIDEO_MAX_WIDTH, VIDEO_BITRATE,
} from "@/lib/constants";

export type ExtractedPage = {
  pageId: string;
  full: Blob;
  thumb: Blob;
  contentType: string;   // what the full blob actually is
  mediaType: "image" | "video";
  durationMs?: number;
};

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

/**
 * Encode down the quality ladder until the result fits the byte budget.
 *
 * A flat page — a slide, a diagram — compresses far below the target at the
 * top quality and stops there. A dense photograph steps down a rung or two.
 * The alternative, one fixed quality for everything, either wastes space on
 * simple pages or softens complicated ones.
 */
async function encodeWithinBudget(canvas: HTMLCanvasElement): Promise<Blob> {
  let best: Blob | null = null;
  for (const q of QUALITY_LADDER) {
    const blob = await toWebp(canvas, q);
    best = blob;
    if (blob.size <= PAGE_BYTE_TARGET) break;
  }
  return best!;
}

async function finish(canvas: HTMLCanvasElement) {
  const full = await encodeWithinBudget(canvas);

  const t = document.createElement("canvas");
  t.width = THUMB_WIDTH_PX;
  t.height = Math.max(1, Math.round(THUMB_WIDTH_PX * (canvas.height / canvas.width)));
  const tc = t.getContext("2d")!;
  tc.imageSmoothingQuality = "high";
  tc.drawImage(canvas, 0, 0, t.width, t.height);
  return { full, thumb: await toWebp(t, 0.78) };
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

    out.push({
      pageId: crypto.randomUUID(),
      ...(await finish(canvas)),
      contentType: "image/webp",
      mediaType: "image" as const,
    });
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

    const encoded = await finish(canvas);
    out.push({
      pageId: crypto.randomUUID(),
      ...encoded,
      contentType: "image/webp",
      mediaType: "image" as const,
    });
    onProgress?.(i + 1, files.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}


/**
 * Videos are uploaded as they are — no re-encoding in a browser tab. What we
 * do produce is a poster frame, so the page has something to show before it
 * plays and the spine has a thumbnail like any other book.
 */
export async function prepareVideos(
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<ExtractedPage[]> {
  const out: ExtractedPage[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const url = URL.createObjectURL(file);

    try {
      const { poster, durationMs } = await posterFrom(url);
      out.push({
        pageId: crypto.randomUUID(),
        full: file,
        thumb: poster,
        contentType: file.type || "video/mp4",
        mediaType: "video",
        durationMs,
      });
    } finally {
      URL.revokeObjectURL(url);
    }

    onProgress?.(i + 1, files.length);
    await new Promise((r) => setTimeout(r, 0));
  }

  return out;
}

/** Grab a frame a little way in, because frame zero is often black. */
function posterFrom(url: string): Promise<{ poster: Blob; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const fail = () => reject(new Error("Could not read that video"));
    video.onerror = fail;

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.6, (video.duration || 1) / 4);
    };

    video.onseeked = async () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, THUMB_WIDTH_PX * 4 / (video.videoWidth || THUMB_WIDTH_PX));
        canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale));
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);

        const poster: Blob = await new Promise((res, rej) =>
          canvas.toBlob((b) => (b ? res(b) : rej(new Error("poster failed"))), "image/webp", 0.85)
        );
        resolve({ poster, durationMs: Math.round((video.duration || 0) * 1000) });
      } catch (e) {
        reject(e);
      }
    };
  });
}


/**
 * Optional video re-encode, done by playing the clip into a canvas and
 * recording that.
 *
 * Be aware of the cost: MediaRecorder runs in real time, so a ninety second
 * clip takes ninety seconds. It is offered as a choice rather than forced,
 * because for short clips the saving is worth the wait and for long ones it
 * is not. The proper answer for anything heavier is server-side encoding —
 * Cloudflare Stream, or a worker running ffmpeg.
 *
 * Returns the original file untouched if the browser can't do this.
 */
export async function compressVideo(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<{ blob: Blob; contentType: string }> {
  if (typeof MediaRecorder === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) {
    return { blob: file, contentType: file.type || "video/mp4" };
  }

  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) return { blob: file, contentType: file.type || "video/mp4" };

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("Could not read that video"));
    });

    const scale = Math.min(1, VIDEO_MAX_WIDTH / (video.videoWidth || VIDEO_MAX_WIDTH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((video.videoWidth || 1280) * scale / 2) * 2;   // even, encoders prefer it
    canvas.height = Math.round((video.videoHeight || 720) * scale / 2) * 2;
    const ctx = canvas.getContext("2d")!;

    const stream = (canvas as any).captureStream(30) as MediaStream;

    // Carry the audio across if the source has any.
    try {
      const src = (video as any).captureStream?.() as MediaStream | undefined;
      src?.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch { /* no audio, or not permitted */ }

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITRATE });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const done = new Promise<Blob>((res) => {
      rec.onstop = () => res(new Blob(chunks, { type: "video/webm" }));
    });

    rec.start(1000);
    video.muted = false;
    await video.play();

    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (video.duration) onProgress?.(Math.min(1, video.currentTime / video.duration));
      raf = requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((res) => { video.onended = () => res(); });
    cancelAnimationFrame(raf);
    rec.stop();

    const blob = await done;
    // If the re-encode came out bigger, keep the original.
    return blob.size < file.size
      ? { blob, contentType: "video/webm" }
      : { blob: file, contentType: file.type || "video/mp4" };
  } catch {
    return { blob: file, contentType: file.type || "video/mp4" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
