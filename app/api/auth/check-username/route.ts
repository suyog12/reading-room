import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u")?.trim() ?? "";
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(u)) {
    return NextResponse.json({ ok: false, reason: "shape" });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("username_available", { candidate: u });
  if (error) return NextResponse.json({ ok: false, reason: "error" });
  return NextResponse.json({ ok: data === true, reason: data ? null : "taken" });
}
