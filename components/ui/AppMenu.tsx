import { createClient } from "@/lib/supabase/server";
import { signRead } from "@/lib/r2";
import { redirect } from "next/navigation";
import MenuButton from "./MenuButton";

/**
 * Renders nothing when signed out, so it is safe to mount in the root layout.
 * Server component: it signs the avatar URL and owns the sign-out action.
 */
export default async function AppMenu() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, role, status, avatar_key")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  const avatarUrl = profile.avatar_key ? await signRead(profile.avatar_key, 3600) : null;

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <MenuButton
      name={profile.display_name ?? user.email ?? ""}
      username={profile.username}
      isAdmin={profile.role === "admin"}
      approved={profile.status === "approved"}
      avatarUrl={avatarUrl}
      signOut={signOut}
    />
  );
}
