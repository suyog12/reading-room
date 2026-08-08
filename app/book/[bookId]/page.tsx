import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { signRead } from "@/lib/r2";
import Reader from "@/components/reader/Reader";

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: book } = await supabase
    .from("books")
    .select("id, title, author, spine_color, layout, kind, owner_id, case_id")
    .eq("id", bookId)
    .single();
  if (!book) notFound();

  const { data: rows } = await supabase
    .from("pages").select("id, position, r2_key").eq("book_id", bookId).order("position");

  const { data: notes } = await supabase
    .from("notes").select("page_id, doc").eq("book_id", bookId);

  // Notebook pages have no r2_key, so there is nothing to sign for them.
  const pages = await Promise.all(
    (rows ?? []).map(async (p) => ({
      id: p.id,
      position: p.position,
      url: p.r2_key ? await signRead(p.r2_key, 3600) : null,
      doc: notes?.find((n) => n.page_id === p.id)?.doc ?? null,
    }))
  );

  const { data: bookcase } = await supabase
    .from("cases").select("room_id").eq("id", book.case_id).single();

  return (
    <Reader
      book={book}
      pages={pages}
      canEdit={book.owner_id === user.id}
      backHref={bookcase ? `/room/${bookcase.room_id}?case=${book.case_id}` : "/floor"}
    />
  );
}
