import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { signRead, deleteObjects } from "@/lib/r2";
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
    .select("id, title, author, spine_color, layout, kind, visibility, owner_id, case_id")
    .eq("id", bookId)
    .single();
  if (!book) notFound();

  const isOwner = book.owner_id === user.id;

  // One function decides what this viewer may load. Locked rows come back
  // with no key at all, so a hidden page keeps its place in the running order
  // without its contents ever reaching the browser.
  const { data: rows } = await supabase.rpc("book_pages_for_viewer", { b: bookId });

  const pages = await Promise.all(
    (rows ?? []).map(async (p: any) => ({
      id: p.id,
      position: p.position,
      locked: p.locked === true,
      hidden: p.hidden === true,
      media_type: p.media_type ?? "image",
      url: p.r2_key ? await signRead(p.r2_key, 3600) : null,
      poster: p.media_type === "video" && p.thumb_key ? await signRead(p.thumb_key, 3600) : null,
      doc: p.doc ?? null,
    }))
  );

  const { data: bookcase } = await supabase
    .from("cases").select("room_id").eq("id", book.case_id).single();

  async function setBookVisibility(formData: FormData) {
    "use server";
    const v = String(formData.get("visibility"));
    if (v !== "open" && v !== "private") return;
    const supabase = await createClient();
    // RLS refuses this for anyone but the owner.
    await supabase.from("books").update({ visibility: v }).eq("id", bookId);
    revalidatePath(`/book/${bookId}`);
  }

  async function setPageVisibility(formData: FormData) {
    "use server";
    const pageId = String(formData.get("pageId"));
    const v = String(formData.get("visibility"));
    if (v !== "open" && v !== "hidden") return;
    const supabase = await createClient();
    await supabase.from("pages").update({ visibility: v }).eq("id", pageId);
    revalidatePath(`/book/${bookId}`);
  }

  async function deleteBook() {
    "use server";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: mine } = await supabase
      .from("books").select("owner_id, case_id").eq("id", bookId).single();
    if (!mine || mine.owner_id !== user.id) return;

    // Clear storage first. If this half fails the rows still point at what
    // remains, so it can be retried; the other way round leaves files nobody
    // can find.
    const { data: keys } = await supabase
      .from("pages").select("r2_key, thumb_key").eq("book_id", bookId);
    await deleteObjects((keys ?? []).flatMap((k) => [k.r2_key, k.thumb_key]));

    // Pages and notes go with it, and the byte counter is put right by the
    // trigger on pages.
    await supabase.from("books").delete().eq("id", bookId);

    const { data: c } = await supabase
      .from("cases").select("room_id").eq("id", mine.case_id).single();
    redirect(c ? `/room/${c.room_id}?case=${mine.case_id}` : "/floor");
  }

  return (
    <Reader
      book={book}
      pages={pages}
      canEdit={isOwner}
      backHref={bookcase ? `/room/${bookcase.room_id}?case=${book.case_id}` : "/floor"}
      setBookVisibility={setBookVisibility}
      setPageVisibility={setPageVisibility}
      deleteBook={deleteBook}
    />
  );
}
