import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, callerKey } from "@/lib/guard";
import { NextResponse } from "next/server";

/**
 * Turns a username into the email behind it so the browser can sign in.
 *
 * This has to work before there is a session, so it cannot require auth. It
 * does confirm whether a username exists. The rate limit keeps that from
 * being a list you can walk; if this app ever opens up, move the limit to
 * something shared across instances.
 */
export async function POST(req: Request) {
  if (!rateLimit(`resolve:${callerKey(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const u = String(body?.username ?? "").trim();

  // Same shape the column allows. Anything else is not a username.
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(u)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles").select("email").ilike("username", u).maybeSingle();
    if (!data?.email) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ email: data.email });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "lookup failed" }, { status: 500 });
  }
}
