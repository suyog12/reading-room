import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles").select("status").eq("id", user.id).single();
    // Home is the building now, not the old /room test page.
    redirect(profile?.status === "approved" ? "/floor" : "/pending");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F1EEE8", fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 460, padding: 32, textAlign: "center" }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "center", alignItems: "flex-end", marginBottom: 26, height: 62 }}>
          {["#7A3230", "#2F5E4E", "#2B3C5C", "#96702C", "#523052"].map((c, i) => (
            <div key={c} style={{ width: 13, height: 44 + (i % 3) * 9, background: c, borderRadius: 2 }} />
          ))}
        </div>

        <h1 style={{ font: "600 30px/1.15 Georgia, serif", color: "#231F1A", marginBottom: 12 }}>
          The Reading Room
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.65, color: "#6B6459", marginBottom: 30 }}>
          Your slide decks and photo sets become books on a shelf. Pull one down,
          open the cover, turn the pages. Your notes live on the left.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Link href="/login" style={{ padding: "11px 22px", background: "#2F5E4E", color: "#fff", borderRadius: 4, fontSize: 14, textDecoration: "none" }}>
            Sign in
          </Link>
          <Link href="/signup" style={{ padding: "11px 22px", color: "#231F1A", border: "1px solid #C9C2B6", borderRadius: 4, fontSize: 14, textDecoration: "none" }}>
            Request an account
          </Link>
        </div>

        <p style={{ fontSize: 12, color: "#9A9184", marginTop: 26 }}>
          New accounts are approved by hand.
        </p>
      </div>
    </main>
  );
}
