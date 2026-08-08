import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import FloorView from "@/components/floor/FloorView";

/**
 * Someone else's building, seen as a guest. Read only: RLS decides whether
 * any rooms come back at all, and nothing here can write.
 */
export default async function VisitPage({
  params, searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const { username } = await params;
  const { f } = await searchParams;
  const floor = Math.max(1, parseInt(f ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hosts } = await supabase.rpc("profile_by_username", { u: username });
  const host = hosts?.[0];
  if (!host) notFound();

  // If they haven't let you in, this comes back empty — the policy decides.
  const { data: rooms } = await supabase
    .from("rooms").select("id, name, floor, position")
    .eq("owner_id", host.id).order("floor").order("position");

  const onThisFloor = (rooms ?? []).filter((r) => r.floor === floor);
  const topFloor = Math.max(1, ...(rooms ?? []).map((r) => r.floor));

  const noop = async () => { "use server"; };

  if (!rooms || rooms.length === 0) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F1EEE8", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center", maxWidth: 380, padding: 24 }}>
          <h1 style={{ font: "600 20px/1.3 Georgia, serif", color: "#231F1A" }}>
            Nothing to see here yet
          </h1>
          <p style={{ fontSize: 13.5, color: "#7C736A", marginTop: 10, lineHeight: 1.6 }}>
            Either {host.display_name ?? username} hasn't built anything, or you're
            not a guest of theirs.
          </p>
          <Link href="/people" style={{ fontSize: 13, color: "#2F5E4E", display: "inline-block", marginTop: 16 }}>
            ← People
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <div style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20,
        background: "rgba(255,253,248,.94)", border: "2px solid #231F1A", borderRadius: 99,
        padding: "7px 16px", fontSize: 12, letterSpacing: ".08em", color: "#231F1A",
        boxShadow: "4px 4px 0 rgba(35,31,26,.13)", fontFamily: "system-ui",
      }}>
        Visiting {host.display_name ?? `@${username}`} · <Link href="/people" style={{ color: "#2F5E4E" }}>leave</Link>
      </div>

      <FloorView
        floor={floor}
        topFloor={topFloor}
        rooms={onThisFloor}
        createRoom={noop}
        renameRoom={noop}
        canEdit={false}
        basePath={`/u/${username}`}
      />
    </>
  );
}
