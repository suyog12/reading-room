import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * Turns a username into the email behind it, so the browser can sign in.
 *
 * Trade-off worth knowing: this confirms whether a username exists and gives
 * back its address. For a hand-approved app with a handful of accounts that
 * is acceptable; if it ever opens up, put a rate limit in front of it or move
 * the whole flow behind a captcha.
 *
 * The sign-in itself deliberately happens in the browser. Signing in from a
 * route handler means the session cookie has to be written onto that response
 * and survive a fetch, which is where it was silently going missing.
 */
export async function POST(req: Request) {
  const { username } = (await req.json()) as { username: string };
  const u = (username ?? "").trim();
  if (!u || u.includes("@")) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles").select("email").ilike("username", u).maybeSingle();
    if (!data?.email) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ email: data.email });
  } catch (e: any) {
    // Most likely SUPABASE_SERVICE_ROLE_KEY is missing.
    return NextResponse.json({ error: e?.message ?? "lookup failed" }, { status: 500 });
  }
}
