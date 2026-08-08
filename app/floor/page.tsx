import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import FloorView from "@/components/floor/FloorView";

export default async function FloorPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const floor = Math.max(1, parseInt(f ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("status, display_name").eq("id", user.id).single();
  if (profile?.status !== "approved") redirect("/pending");

  // Every room the user owns, so we can show which floors exist.
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, name, floor, position")
    .eq("owner_id", user.id)
    .order("floor")
    .order("position");

  const onThisFloor = (rooms ?? []).filter((r) => r.floor === floor);
  const topFloor = Math.max(1, ...(rooms ?? []).map((r) => r.floor));

  async function createRoom(formData: FormData) {
    "use server";
    const side = Number(formData.get("side"));
    const onFloor = Number(formData.get("floor"));
    const name = String(formData.get("name") ?? "").trim() || "New room";

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("rooms").insert({
      owner_id: user.id, name, floor: onFloor, position: side,
    });
    revalidatePath("/floor");
  }

  async function renameRoom(formData: FormData) {
    "use server";
    const id = String(formData.get("roomId"));
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const supabase = await createClient();
    await supabase.from("rooms").update({ name }).eq("id", id);
    revalidatePath("/floor");
  }

  return (
    <FloorView
      floor={floor}
      topFloor={topFloor}
      rooms={onThisFloor}
      createRoom={createRoom}
      renameRoom={renameRoom}
    />
  );
}
