import { createClient } from "@/lib/supabase/server";
import { signRead } from "@/lib/r2";
import { redirect } from "next/navigation";
import ProfileForm from "@/components/ui/ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // email and dob are no longer readable through the table by anyone, so your
  // own row comes back through a function that only ever returns one row.
  const { data: rows } = await supabase.rpc("my_profile");
  const profile = rows?.[0];

  const avatarUrl = profile?.avatar_key ? await signRead(profile.avatar_key, 3600) : null;

  return (
    <ProfileForm
      profile={{
        first_name: profile?.first_name ?? "",
        last_name: profile?.last_name ?? "",
        username: profile?.username ?? "",
        dob: profile?.dob ?? "",
        email: profile?.email ?? user.email ?? "",
        display_name: profile?.display_name ?? "",
        status: profile?.status ?? null,
      }}
      avatarUrl={avatarUrl}
    />
  );
}
