import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import RoomView from "@/components/room/RoomView";

const NOTEBOOK_PAGES = 12;

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const { roomId } = await params;
  const { case: selectedCase } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: room } = await supabase
    .from("rooms").select("id, name, floor, position, owner_id, visibility")
    .eq("id", roomId).single();
  if (!room) notFound();

  const { data: cases } = await supabase
    .from("cases").select("id, label, tone, position")
    .eq("room_id", roomId).order("position");

  const caseIds = (cases ?? []).map((c) => c.id);
  const { data: books } = caseIds.length
    ? await supabase
        .from("books")
        .select("id, case_id, title, author, spine_color, layout, kind, visibility, page_count, position")
        .in("case_id", caseIds)
        .order("position")
    : { data: [] };

  // Everyone who may already visit this owner, so the settings bubble can
  // offer them. Plus whoever is already named for this room.
  const { data: accepted } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("owner_id", user.id)
    .eq("status", "accepted");

  const guestIds = (accepted ?? []).map((f) => f.follower_id);
  const { data: guestProfiles } = guestIds.length
    ? await supabase.from("profiles")
        .select("id, username, display_name").in("id", guestIds)
    : { data: [] };

  const { data: named } = await supabase
    .from("room_guests").select("guest_id").eq("room_id", roomId);

  async function createCase(formData: FormData) {
    "use server";
    const label = String(formData.get("label") ?? "").trim() || "New case";
    const tone = String(formData.get("tone") ?? "oak");
    const position = Number(formData.get("position"));
    const id = String(formData.get("roomId"));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("cases").insert({ room_id: id, owner_id: user.id, label, tone, position });
    revalidatePath(`/room/${id}`);
  }

  /** A notebook is a book with no images: blank pages, notes on both sides. */
  async function createNotebook(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim() || "Notebook";
    const caseId = String(formData.get("caseId"));
    const position = Number(formData.get("position"));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: book } = await supabase
      .from("books")
      .insert({
        case_id: caseId, owner_id: user.id, title,
        kind: "notebook", layout: "notes", spine_color: "#3B4A57", position,
      })
      .select("id").single();
    if (!book) return;

    const rows = Array.from({ length: NOTEBOOK_PAGES }, (_, i) => ({
      book_id: book.id, owner_id: user.id, position: i, r2_key: null, bytes: 0,
    }));
    const { data: pages } = await supabase.from("pages").insert(rows).select("id");

    if (pages?.length) {
      await supabase.from("notes").insert(
        pages.map((p) => ({ page_id: p.id, book_id: book.id, owner_id: user.id }))
      );
    }

    redirect(`/book/${book.id}`);
  }

  async function renameRoom(formData: FormData) {
    "use server";
    const id = String(formData.get("roomId"));
    const name = String(formData.get("name") ?? "").trim();
    const visibility = String(formData.get("visibility") ?? "open");
    if (!name || !["open", "invited", "closed"].includes(visibility)) return;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // The guest list is managed a person at a time by toggleRoomGuest, so
    // saving the name and the access level does not touch it. Bundling the
    // two meant a tick did nothing until you pressed save, and a tick that
    // failed to arrive was silent.
    const { error: roomErr } = await supabase
      .from("rooms").update({ name, visibility }).eq("id", id);
    if (roomErr) console.error("[room settings] update failed:", roomErr.message);

    revalidatePath(`/room/${id}`);
    revalidatePath("/floor");
  }

  /** Let one person in, or shut them out. Writes immediately. */
  async function toggleRoomGuest(formData: FormData) {
    "use server";
    const id = String(formData.get("roomId"));
    const guestId = String(formData.get("guestId"));
    const letIn = formData.get("letIn") === "yes";

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (letIn) {
      // The policy refuses anyone who is not already an accepted guest of
      // yours, and any room that is not yours.
      const { error } = await supabase.from("room_guests")
        .insert({ room_id: id, guest_id: guestId, owner_id: user.id });
      if (error) console.error("[room guests] could not let them in:", error.message);
    } else {
      const { error } = await supabase.from("room_guests")
        .delete().eq("room_id", id).eq("guest_id", guestId);
      if (error) console.error("[room guests] could not shut them out:", error.message);
    }

    revalidatePath(`/room/${id}`);
  }

  async function renameCase(formData: FormData) {
    "use server";
    const id = String(formData.get("caseId"));
    const roomIdIn = String(formData.get("roomId"));
    const label = String(formData.get("label") ?? "").trim();
    const tone = String(formData.get("tone") ?? "oak");
    if (!label) return;

    const supabase = await createClient();
    await supabase.from("cases").update({ label, tone }).eq("id", id);
    revalidatePath(`/room/${roomIdIn}`);
  }

  async function deleteCase(formData: FormData) {
    "use server";
    const caseId = String(formData.get("caseId"));
    const id = String(formData.get("roomId"));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // The trigger refuses a case with books on it; RLS refuses one that is
    // not yours. Both checks live in the database.
    const { error } = await supabase.from("cases").delete().eq("id", caseId);
    if (error) return;
    revalidatePath(`/room/${id}`);
  }

  async function deleteRoom(formData: FormData) {
    "use server";
    const id = String(formData.get("roomId"));

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) return;
    redirect("/floor");
  }

  return (
    <RoomView
      room={room}
      cases={cases ?? []}
      books={books ?? []}
      selectedCase={selectedCase ?? null}
      canEdit={room.owner_id === user.id}
      createCase={createCase}
      createNotebook={createNotebook}
      renameRoom={renameRoom}
      renameCase={renameCase}
      deleteCase={deleteCase}
      deleteRoom={deleteRoom}
      guests={(guestProfiles ?? []).map((g) => ({
        id: g.id,
        name: g.display_name ?? g.username ?? "Someone",
        username: g.username,
      }))}
      roomGuestIds={(named ?? []).map((n) => n.guest_id)}
      toggleRoomGuest={toggleRoomGuest}
    />
  );
}
