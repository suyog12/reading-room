import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect("/");

  // RLS lets an admin update any profile, so no service role key is needed.
  const { data: people } = await supabase
    .from("profiles")
    .select("id, display_name, status, created_at")
    .order("created_at", { ascending: false });

  const setStatus = async (formData: FormData) => {
    "use server";
    const id = formData.get("id") as string;
    const status = formData.get("status") as string;
    if (status !== "approved" && status !== "suspended") return;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // A server action is a public endpoint. The page guard above only stops
    // the page rendering; it does not stop someone posting to the action.
    // RLS would refuse this anyway, but the check belongs here as well.
    const { data: me } = await supabase
      .from("profiles").select("role").eq("id", user.id).single();
    if (me?.role !== "admin") return;

    await supabase.from("profiles").update({ status }).eq("id", id);
    revalidatePath("/admin");
  };

  return (
    <main style={{ maxWidth: 620, margin: "8vh auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, marginBottom: 18 }}>Accounts</h1>
      {people?.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #eee" }}>
          <span style={{ flex: 1, fontSize: 14 }}>{p.display_name}</span>
          <span style={{ fontSize: 12, color: "#888", width: 80 }}>{p.status}</span>
          <form action={setStatus}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="status" value={p.status === "approved" ? "suspended" : "approved"} />
            <button style={{ padding: "6px 12px", fontSize: 12, border: "1px solid #ccc", background: "#fff", borderRadius: 4, cursor: "pointer" }}>
              {p.status === "approved" ? "Suspend" : "Approve"}
            </button>
          </form>
        </div>
      ))}
    </main>
  );
}
