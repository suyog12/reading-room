import { createClient } from "@/lib/supabase/server";
import { signRead } from "@/lib/r2";
import { redirect } from "next/navigation";
import ProfileForm from "@/components/ui/ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, username, dob, email, avatar_key, display_name, status")
    .eq("id", user.id)
    .single();

  const avatarUrl = profile?.avatar_key ? await signRead(profile.avatar_key, 3600) : null;

  return (
    <ProfileForm
      profile={{ ...profile, email: profile?.email ?? user.email ?? "" }}
      avatarUrl={avatarUrl}
    />
  );
}
