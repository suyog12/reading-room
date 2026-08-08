import { createClient } from "@/lib/supabase/server";
import { statObject, pageKey, thumbKey, deleteObject, MAX_FILE_BYTES } from "@/lib/r2";
import { NextResponse } from "next/server";

/**
 * Called after the browser has PUT everything to R2. This is the source of
 * truth: HEAD each object to learn its real size, drop anything oversized,
 * and only then write page rows. A half-finished upload leaves a book with
 * fewer pages — never rows pointing at objects that don't exist.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { pageIds } = (await req.json()) as { pageIds: string[] };

  const { data: book } = await supabase
    .from("books").select("id, owner_id").eq("id", bookId).single();
  if (!book || book.owner_id !== user.id)
    return NextResponse.json({ error: "not your book" }, { status: 403 });

  const rows: any[] = [];
  for (const pid of pageIds) {
    const key = pageKey(user.id, bookId, pid);
    try {
      const { bytes } = await statObject(key);
      if (bytes > MAX_FILE_BYTES) { await deleteObject(key); continue; }
      rows.push({
        id: pid, book_id: bookId, owner_id: user.id, position: rows.length,
        r2_key: key, thumb_key: thumbKey(user.id, bookId, pid), bytes,
      });
    } catch {
      // never landed; skip rather than write a dangling row
    }
  }

  if (rows.length === 0)
    return NextResponse.json({ error: "nothing uploaded" }, { status: 400 });

  const { error } = await supabase.from("pages").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // one empty note per page so the reader never creates rows mid-read
  await supabase.from("notes").insert(
    rows.map((r) => ({ page_id: r.id, book_id: bookId, owner_id: user.id }))
  );

  return NextResponse.json({ pages: rows.length });
}
