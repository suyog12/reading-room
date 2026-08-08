import { createClient } from "@/lib/supabase/server";
import { signDownload } from "@/lib/r2";
import { isUuid } from "@/lib/guard";
import { NextResponse } from "next/server";

/**
 * Hands back a download link for one page — to its owner only.
 *
 * Note this is stricter than /url, deliberately. That one lets RLS decide, so
 * a guest can *view* a page. Downloading is an owner-only action, so the check
 * here is an explicit owner_id comparison rather than "did the row come back".
 * A guest gets 403 even though they can see the same page on screen.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  if (!isUuid(pageId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { data: page } = await supabase
    .from("pages")
    .select("r2_key, position, owner_id, media_type, book_id")
    .eq("id", pageId)
    .single();

  if (!page || !page.r2_key) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (page.owner_id !== user.id) {
    return NextResponse.json({ error: "Only the owner can download pages" }, { status: 403 });
  }

  const { data: book } = await supabase
    .from("books").select("title").eq("id", page.book_id).single();

  const ext = page.r2_key.split(".").pop() ?? "webp";
  const title = (book?.title ?? "book").trim();
  const filename = `${title} - page ${String(page.position + 1).padStart(2, "0")}.${ext}`;

  return NextResponse.json({ url: await signDownload(page.r2_key, filename) });
}
