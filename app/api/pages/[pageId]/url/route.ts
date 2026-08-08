import { createClient } from "@/lib/supabase/server";
import { signRead } from "@/lib/r2";
import { isUuid } from "@/lib/guard";
import { NextResponse } from "next/server";

/**
 * A read URL for one page, if the caller may see it.
 *
 * The select is the permission check: it runs as the signed-in user, and the
 * pages policy already accounts for closed rooms, private books and hidden
 * pages. A row that comes back is a row they may look at.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  if (!isUuid(pageId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: page } = await supabase
    .from("pages").select("r2_key").eq("id", pageId).single();

  if (!page?.r2_key) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ url: await signRead(page.r2_key, 3600) });
}
