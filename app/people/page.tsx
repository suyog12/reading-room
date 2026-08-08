import { createClient } from "@/lib/supabase/server";
import { signRead } from "@/lib/r2";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import PeopleView from "@/components/people/PeopleView";

export type Person = {
  id: string; username: string | null; display_name: string | null;
  avatarUrl: string | null;
};

export default async function PeoplePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles").select("status").eq("id", user.id).single();
  if (me?.status !== "approved") redirect("/pending");

  // Every request touching me, in either direction.
  const { data: rows } = await supabase
    .from("follows")
    .select("follower_id, owner_id, status, initiated_by, created_at")
    .or(`follower_id.eq.${user.id},owner_id.eq.${user.id}`);

  const otherIds = Array.from(new Set(
    (rows ?? []).map((r) => (r.follower_id === user.id ? r.owner_id : r.follower_id))
  ));

  const { data: profiles } = otherIds.length
    ? await supabase.from("profiles")
        .select("id, username, display_name, avatar_key").in("id", otherIds)
    : { data: [] };

  const people = new Map<string, Person>();
  for (const p of profiles ?? []) {
    people.set(p.id, {
      id: p.id, username: p.username, display_name: p.display_name,
      avatarUrl: p.avatar_key ? await signRead(p.avatar_key, 3600) : null,
    });
  }

  const decorate = (r: any) => {
    const otherId = r.follower_id === user.id ? r.owner_id : r.follower_id;
    return {
      ...r,
      person: people.get(otherId) ?? { id: otherId, username: null, display_name: "Someone", avatarUrl: null },
      // Am I the guest in this pairing, or the host?
      iAmGuest: r.follower_id === user.id,
      mine: r.initiated_by === user.id,
    };
  };

  const all = (rows ?? []).map(decorate);

  async function request(formData: FormData) {
    "use server";
    const otherId = String(formData.get("otherId"));
    const asGuest = formData.get("as") === "guest";   // I want to visit them
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("follows").insert({
      follower_id: asGuest ? user.id : otherId,
      owner_id: asGuest ? otherId : user.id,
      initiated_by: user.id,
      status: "pending",
    });
    revalidatePath("/people");
  }

  async function respond(formData: FormData) {
    "use server";
    const followerId = String(formData.get("followerId"));
    const ownerId = String(formData.get("ownerId"));
    const accept = formData.get("accept") === "yes";
    const supabase = await createClient();

    if (accept) {
      await supabase.from("follows").update({ status: "accepted" })
        .eq("follower_id", followerId).eq("owner_id", ownerId);
    } else {
      await supabase.from("follows").delete()
        .eq("follower_id", followerId).eq("owner_id", ownerId);
    }
    revalidatePath("/people");
  }

  return (
    <PeopleView
      meId={user.id}
      rows={all}
      request={request}
      respond={respond}
    />
  );
}
