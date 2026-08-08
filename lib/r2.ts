import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// R2 speaks the S3 API. Region is always "auto".
export const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET!;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * Presigned PUT for a direct browser upload. ContentLength and ContentType are
 * both part of the signature, so a client that sends more bytes than declared,
 * or a different type than declared, is rejected by R2 itself.
 */
export async function signUpload(key: string, bytes: number, contentType = "image/webp") {
  const cap = contentType.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
  if (bytes > cap) throw new Error(`File over the limit: ${bytes}`);
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentLength: bytes, ContentType: contentType }),
    { expiresIn: 600 }
  );
}

/** Short-lived read URL. Treat it as a bearer token: whoever holds it can read. */
export async function signRead(key: string, seconds = 3600) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: seconds });
}

/**
 * A read URL that arrives as a download rather than opening in the tab.
 * Content-Disposition is signed in, so the filename cannot be tampered with
 * after the fact.
 */
export async function signDownload(key: string, filename: string, seconds = 120) {
  // Quotes and newlines would break the header; strip anything awkward.
  const safe = filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "page";
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safe}"`,
    }),
    { expiresIn: seconds }
  );
}

/** Verify an object actually landed, and how big it really is. */
export async function statObject(key: string) {
  const out = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  return { bytes: out.ContentLength ?? 0, contentType: out.ContentType };
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Remove several objects, ignoring ones that were already gone.
 *
 * Storage is cleared BEFORE the rows, deliberately. If this fails halfway the
 * rows still point at what is left and it can be retried; the other order
 * would leave files with nothing referencing them and no way to find them.
 */
export async function deleteObjects(keys: (string | null | undefined)[]) {
  await Promise.all(
    keys.filter(Boolean).map(async (k) => {
      try { await deleteObject(k as string); } catch { /* already gone */ }
    })
  );
}

// Key layout. Page id, never page number, so reordering never touches R2.
// The extension varies now a page can be video; the poster beside it is
// always a webp.
export const pageKey = (u: string, b: string, p: string, ext = "webp") =>
  `u/${u}/b/${b}/p/${p}.${ext}`;
export const thumbKey = (u: string, b: string, p: string) =>
  `u/${u}/b/${b}/t/${p}.webp`;
