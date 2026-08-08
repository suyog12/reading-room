/** Shared input guards. Small, but the difference between a key and an exploit. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Page ids arrive from the browser and are pasted straight into an R2 object
 * key. Without this, a "page id" of `../../../someone-else/p/1` writes outside
 * your own prefix. Anything that is not a plain UUID is refused.
 */
export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID.test(v);

/**
 * A crude per-process rate limit. Serverless means several instances, so this
 * is a speed bump rather than a wall — enough to stop someone walking a
 * username list from one machine. Swap for Upstash or Vercel KV if this ever
 * opens up beyond a handful of people.
 */
const hits = new Map<string, { n: number; until: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const row = hits.get(key);

  if (!row || now > row.until) {
    hits.set(key, { n: 1, until: now + windowMs });
    return true;
  }
  if (row.n >= max) return false;
  row.n++;
  return true;
}

/** Best guess at the caller, for rate limiting only. Spoofable; not for auth. */
export function callerKey(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for")?.split(",")[0].trim()
    || h.get("x-real-ip")
    || "unknown").slice(0, 64);
}
