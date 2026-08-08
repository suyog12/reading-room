/**
 * Verifies R2 credentials, bucket access, and CORS before you build anything
 * on top. Run:  node --env-file=.env.local scripts/check-r2.mjs
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const need = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET;
const key = `_healthcheck/${Date.now()}.txt`;
const body = "reading room ok";

try {
  console.log("1. signing a PUT ...");
  const putUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentLength: body.length, ContentType: "text/plain" }),
    { expiresIn: 120 }
  );

  console.log("2. uploading with that URL ...");
  const put = await fetch(putUrl, {
    method: "PUT",
    body,
    headers: { "content-type": "text/plain", "content-length": String(body.length) },
  });
  if (!put.ok) throw new Error(`PUT failed ${put.status} ${await put.text()}`);

  console.log("3. signing a GET and reading it back ...");
  const getUrl = await getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 120 });
  const got = await fetch(getUrl);
  const text = await got.text();
  if (text !== body) throw new Error(`Read back wrong content: ${text}`);

  console.log("4. cleaning up ...");
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

  console.log("\nR2 is wired up correctly.");
} catch (err) {
  console.error("\nFailed:", err.message);
  console.error("\nUsual causes:");
  console.error("  403 SignatureDoesNotMatch  -> wrong secret, or endpoint has the bucket name appended");
  console.error("  404 NoSuchBucket           -> R2_BUCKET name typo");
  console.error("  401                        -> token lacks Object Read & Write, or is scoped to another bucket");
  process.exit(1);
}
