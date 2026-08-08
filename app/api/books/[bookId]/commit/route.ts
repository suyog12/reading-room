import { createClient } from "@/lib/supabase/server";
import { statObject, pageKey, thumbKey, deleteObject, MAX_FILE_BYTES, MAX_VIDEO_BYTES } from "@/lib/r2";
import { MEDIA, isVideoType } from "@/lib/constants";
import { isUuid } from "@/lib/guard";
import { NextResponse } from "next/server";

type Done = { pageId: string; ext: string; mediaType: "image" | "video"; durationMs?: number };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  if (!isUuid(bookId)) return NextResponse.json({ error: "bad book" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const pages: Done[] = Array.isArray(body?.pages) ? body.pages : [];
  const allowedExt = new Set(Object.values(MEDIA));

  if (
    pages.length === 0 || pages.length > 400 ||
    !pages.every((p) => isUuid(p?.pageId) && allowedExt.has(p?.ext))
  ) {
    return NextResponse.json({ error: "bad page list" }, { status: 400 });
  }

  const { data: book } = await supabase
    .from("books").select("id, owner_id").eq("id", bookId).single();
  if (!book || book.owner_id !== user.id) {
    return NextResponse.json({ error: "not your book" }, { status: 403 });
  }

  const rows: any[] = [];
  for (const p of pages) {
    const key = pageKey(user.id, bookId, p.pageId, p.ext);
    try {
      const { bytes, contentType } = await statObject(key);
      const isVideo = !!contentType && isVideoType(contentType);
      const cap = isVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;

      // Only what we said we would accept, confirmed from the stored object
      // rather than from whatever the client claimed.
      if (bytes > cap || !contentType || !(contentType.startsWith("image/") || isVideo)) {
        await deleteObject(key);
        continue;
      }

      rows.push({
        id: p.pageId, book_id: bookId, owner_id: user.id, position: rows.length,
        r2_key: key, thumb_key: thumbKey(user.id, bookId, p.pageId), bytes,
        media_type: isVideo ? "video" : "image",
        duration_ms: isVideo ? (p.durationMs ?? null) : null,
      });
    } catch {
      // never landed; skip rather than write a dangling row
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "nothing uploaded" }, { status: 400 });
  }

  const { error } = await supabase.from("pages").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("notes").insert(
    rows.map((r) => ({ page_id: r.id, book_id: bookId, owner_id: user.id }))
  );

  return NextResponse.json({ pages: rows.length });
}
