import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PendingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, display_name")
    .eq("id", user.id)
    .single();

  if (profile?.status === "approved") redirect("/");

  const signOut = async () => {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  };

  return (
    <main style={{ maxWidth: 400, margin: "18vh auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Waiting on approval</h1>
      <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>
        Your account exists but has not been let in yet. You will be able to sign
        in normally once it is approved.
      </p>
      <form action={signOut}>
        <button style={{ marginTop: 20, padding: "8px 14px", fontSize: 13, border: "1px solid #ccc", background: "#fff", borderRadius: 4, cursor: "pointer" }}>
          Sign out
        </button>
      </form>
    </main>
  );
}
