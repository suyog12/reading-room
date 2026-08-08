import { createClient } from "@/lib/supabase/server";
import { rateLimit, callerKey } from "@/lib/guard";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  if (!rateLimit(`uname:${callerKey(req)}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, reason: "rate" }, { status: 429 });
  }

  const u = new URL(req.url).searchParams.get("u")?.trim() ?? "";
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(u)) {
    return NextResponse.json({ ok: false, reason: "shape" });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("username_available", { candidate: u });
  if (error) return NextResponse.json({ ok: false, reason: "error" });
  return NextResponse.json({ ok: data === true, reason: data ? null : "taken" });
}
