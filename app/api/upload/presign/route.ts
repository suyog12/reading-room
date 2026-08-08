import { createClient } from "@/lib/supabase/server";
import { signUpload, pageKey, thumbKey, MAX_FILE_BYTES } from "@/lib/r2";
import { NextResponse } from "next/server";

type Item = { pageId: string; bytes: number; thumbBytes: number };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { bookId, items } = (await req.json()) as { bookId: string; items: Item[] };

  // Confirm the book is theirs before signing anything for it.
  const { data: book } = await supabase
    .from("books").select("id, owner_id").eq("id", bookId).single();
  if (!book || book.owner_id !== user.id)
    return NextResponse.json({ error: "not your book" }, { status: 403 });

  for (const it of items) {
    if (it.bytes > MAX_FILE_BYTES)
      return NextResponse.json({ error: "page over 20MB" }, { status: 413 });
  }

  const signed = await Promise.all(
    items.map(async (it) => ({
      pageId: it.pageId,
      pageUrl: await signUpload(pageKey(user.id, book.id, it.pageId), it.bytes),
      thumbUrl: await signUpload(thumbKey(user.id, book.id, it.pageId), it.thumbBytes),
    }))
  );

  return NextResponse.json({ signed });
}
