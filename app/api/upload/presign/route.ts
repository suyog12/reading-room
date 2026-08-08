import { createClient } from "@/lib/supabase/server";
import { signUpload, pageKey, thumbKey, MAX_FILE_BYTES, MAX_VIDEO_BYTES } from "@/lib/r2";
import { MEDIA, isVideoType } from "@/lib/constants";
import { isUuid } from "@/lib/guard";
import { NextResponse } from "next/server";

type Item = { pageId: string; bytes: number; thumbBytes: number; contentType: string };

const MAX_PAGES = 400;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const bookId = body?.bookId;
  const items: Item[] = Array.isArray(body?.items) ? body.items : [];

  if (!isUuid(bookId)) return NextResponse.json({ error: "bad book" }, { status: 400 });
  if (items.length === 0 || items.length > MAX_PAGES) {
    return NextResponse.json({ error: "bad page count" }, { status: 400 });
  }

  for (const it of items) {
    // A page id becomes part of an object key. Anything but a UUID could climb
    // out of this user's prefix.
    if (!isUuid(it?.pageId)) {
      return NextResponse.json({ error: "bad page id" }, { status: 400 });
    }
    // Only types we know how to store and play.
    if (!MEDIA[it?.contentType]) {
      return NextResponse.json({ error: `unsupported type: ${it?.contentType}` }, { status: 415 });
    }
    const cap = isVideoType(it.contentType) ? MAX_VIDEO_BYTES : MAX_FILE_BYTES;
    if (!Number.isFinite(it.bytes) || it.bytes <= 0 || it.bytes > cap) {
      return NextResponse.json({ error: "file too large" }, { status: 413 });
    }
    if (!Number.isFinite(it.thumbBytes) || it.thumbBytes <= 0 || it.thumbBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "thumbnail too large" }, { status: 413 });
    }
  }

  const { data: book } = await supabase
    .from("books").select("id, owner_id").eq("id", bookId).single();
  if (!book || book.owner_id !== user.id) {
    return NextResponse.json({ error: "not your book" }, { status: 403 });
  }

  const signed = await Promise.all(
    items.map(async (it) => {
      const ext = MEDIA[it.contentType];
      return {
        pageId: it.pageId,
        ext,
        pageUrl: await signUpload(pageKey(user.id, book.id, it.pageId, ext), it.bytes, it.contentType),
        thumbUrl: await signUpload(thumbKey(user.id, book.id, it.pageId), it.thumbBytes, "image/webp"),
      };
    })
  );

  return NextResponse.json({ signed });
}
