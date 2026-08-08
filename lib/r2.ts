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

/**
 * Presigned PUT for a direct browser upload.
 * ContentLength is part of the signature, so a client that sends more bytes
 * than declared is rejected by R2 itself. That is the real size limit —
 * the check in the UI is only there to give a nicer error.
 */
export async function signUpload(key: string, bytes: number, contentType = "image/webp") {
  if (bytes > MAX_FILE_BYTES) throw new Error(`File over 20MB limit: ${bytes}`);
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentLength: bytes, ContentType: contentType }),
    { expiresIn: 300 } // 5 minutes
  );
}

/** Short-lived read URL. Treat it as a bearer token: whoever holds it can read. */
export async function signRead(key: string, seconds = 3600) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: seconds });
}

/** Verify an object actually landed, and how big it really is. */
export async function statObject(key: string) {
  const out = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  return { bytes: out.ContentLength ?? 0, contentType: out.ContentType };
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Key layout. Page id, never page number, so reordering never touches R2.
export const pageKey  = (u: string, b: string, p: string) => `u/${u}/b/${b}/p/${p}.webp`;
export const thumbKey = (u: string, b: string, p: string) => `u/${u}/b/${b}/t/${p}.webp`;
