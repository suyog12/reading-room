import { createClient } from "@/lib/supabase/server";
import { signUpload, signRead } from "@/lib/r2";
import { NextResponse } from "next/server";

const MAX_AVATAR = 4 * 1024 * 1024;

/** Presign a PUT for a new avatar. The browser uploads straight to R2. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { bytes } = (await req.json()) as { bytes: number };
  if (!bytes || bytes > MAX_AVATAR) {
    return NextResponse.json({ error: "Keep it under 4MB" }, { status: 413 });
  }

  // New key each time, so a changed picture is never served from cache.
  const key = `u/${user.id}/avatar/${crypto.randomUUID()}.webp`;
  const url = await signUpload(key, bytes);
  return NextResponse.json({ url, key });
}

/** A short-lived read URL for an avatar the caller is allowed to see. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !key) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Only keys that belong to a profile you can read.
  const { data } = await supabase
    .from("profiles").select("id").eq("avatar_key", key).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ url: await signRead(key, 3600) });
}
