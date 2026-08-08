import { createClient } from "@/lib/supabase/server";
import { signRead } from "@/lib/r2";
import { NextResponse } from "next/server";

/**
 * Hands out a short-lived read URL for one page, and only to someone allowed
 * to see it.
 *
 * The permission check IS the .select() below. It runs as the logged-in user,
 * so RLS decides: your own page, or the owner is public, or you're an accepted
 * follower. Anyone else gets zero rows and a 404 even with a valid page id.
 * Never use the service role here — that would bypass every policy.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("pages")
    .select("r2_key")
    .eq("id", pageId)
    .single();

  if (!page) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = await signRead(page.r2_key, 3600);
  return NextResponse.json({ url });
}
