"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INK = "#231F1A", PAPER = "#FFFDF8", WASH = "#F3EFE7";
const SOFT = "#7C736A", EDGE = "#E4DED2", GREEN = "#2F5E4E";

type Person = { id: string; username: string | null; display_name: string | null; avatarUrl: string | null };
type Row = {
  follower_id: string; owner_id: string; status: string; initiated_by: string;
  person: Person; iAmGuest: boolean; mine: boolean;
};

export default function PeopleView({
  meId, rows, request, respond,
}: {
  meId: string;
  rows: Row[];
  request: (fd: FormData) => Promise<void>;
  respond: (fd: FormData) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("search_people", { q: q.trim() });
      setResults(data ?? []);
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  /**
   * A row grants one person access to one building, so the two directions are
   * independent. Asking to visit someone who already visits you is a normal
   * thing to want, so each side is tracked separately.
   */
  const iVisit = new Set(rows.filter((r) => r.iAmGuest).map((r) => r.person.id));
  const theyVisit = new Set(rows.filter((r) => !r.iAmGuest).map((r) => r.person.id));

  // Waiting on me: the other side asked, I haven't answered.
  const toAnswer = rows.filter((r) => r.status === "pending" && !r.mine);
  const waiting  = rows.filter((r) => r.status === "pending" && r.mine);
  const canVisit = rows.filter((r) => r.status === "accepted" && r.iAmGuest);
  const myGuests = rows.filter((r) => r.status === "accepted" && !r.iAmGuest);

  return (
    <main style={{ minHeight: "100vh", background: "#F1EEE8", fontFamily: "system-ui", padding: "40px 16px 80px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 12, color: SOFT, textDecoration: "none" }}>← Back to the building</Link>
        <h1 style={{ font: "600 24px/1.2 Georgia, serif", color: INK, margin: "14px 0 6px" }}>People</h1>
        <p style={{ fontSize: 13, color: SOFT, marginBottom: 22, lineHeight: 1.55 }}>
          Guests can walk through your rooms and read what's on your shelves. They
          can't move or add anything.
        </p>

        <Card title="Find someone">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Username, first name, or last name"
            style={{
              width: "100%", padding: "11px 13px", borderRadius: 12,
              border: `2px solid ${EDGE}`, background: WASH, color: INK,
              font: "400 15px system-ui", outline: "none",
            }}
          />
          {q.trim().length >= 2 && (
            <div style={{ marginTop: 14 }}>
              {searching && <Muted>Looking…</Muted>}
              {!searching && results.length === 0 && <Muted>Nobody by that name.</Muted>}
              {results.map((p) => (
                <PersonRow key={p.id} person={{ ...p, avatarUrl: null }}
                  note={
                    iVisit.has(p.id) && theyVisit.has(p.id) ? "you visit each other"
                    : iVisit.has(p.id) ? "you can visit them"
                    : theyVisit.has(p.id) ? "they can visit you"
                    : undefined
                  }>
                  <span style={{ display: "flex", gap: 7 }}>
                    {!iVisit.has(p.id) && (
                      <form action={request}>
                        <input type="hidden" name="otherId" value={p.id} />
                        <input type="hidden" name="as" value="guest" />
                        <button style={btn(false)}>Ask to visit</button>
                      </form>
                    )}
                    {!theyVisit.has(p.id) && (
                      <form action={request}>
                        <input type="hidden" name="otherId" value={p.id} />
                        <input type="hidden" name="as" value="host" />
                        <button style={btn(true)}>Invite them</button>
                      </form>
                    )}
                    {iVisit.has(p.id) && theyVisit.has(p.id) && <Muted>Both ways</Muted>}
                  </span>
                </PersonRow>
              ))}
            </div>
          )}
        </Card>

        {toAnswer.length > 0 && (
          <Card title="Waiting on you">
            {toAnswer.map((r) => (
              <PersonRow key={`${r.follower_id}-${r.owner_id}`} person={r.person}
                note={r.iAmGuest ? "invited you to visit" : "asked to visit you"}>
                <span style={{ display: "flex", gap: 7 }}>
                  <form action={respond}>
                    <input type="hidden" name="followerId" value={r.follower_id} />
                    <input type="hidden" name="ownerId" value={r.owner_id} />
                    <input type="hidden" name="accept" value="yes" />
                    <button style={btn(false)}>Accept</button>
                  </form>
                  <form action={respond}>
                    <input type="hidden" name="followerId" value={r.follower_id} />
                    <input type="hidden" name="ownerId" value={r.owner_id} />
                    <input type="hidden" name="accept" value="no" />
                    <button style={btn(true)}>Decline</button>
                  </form>
                </span>
              </PersonRow>
            ))}
          </Card>
        )}

        {waiting.length > 0 && (
          <Card title="Waiting on them">
            {waiting.map((r) => (
              <PersonRow key={`${r.follower_id}-${r.owner_id}`} person={r.person}
                note={r.iAmGuest ? "you asked to visit" : "you invited them"}>
                <form action={respond}>
                  <input type="hidden" name="followerId" value={r.follower_id} />
                  <input type="hidden" name="ownerId" value={r.owner_id} />
                  <input type="hidden" name="accept" value="no" />
                  <button style={btn(true)}>Cancel</button>
                </form>
              </PersonRow>
            ))}
          </Card>
        )}

        {canVisit.length > 0 && (
          <Card title="Buildings you can visit">
            {canVisit.map((r) => (
              <PersonRow key={`${r.follower_id}-${r.owner_id}`} person={r.person}>
                {r.person.username && (
                  <Link href={`/u/${r.person.username}`} style={{ ...btn(false), textDecoration: "none", display: "inline-block" }}>
                    Visit
                  </Link>
                )}
              </PersonRow>
            ))}
          </Card>
        )}

        {myGuests.length > 0 && (
          <Card title="Your guests">
            {myGuests.map((r) => (
              <PersonRow key={`${r.follower_id}-${r.owner_id}`} person={r.person} note="can visit you">
                <form action={respond}>
                  <input type="hidden" name="followerId" value={r.follower_id} />
                  <input type="hidden" name="ownerId" value={r.owner_id} />
                  <input type="hidden" name="accept" value="no" />
                  <button style={btn(true)}>Remove</button>
                </form>
              </PersonRow>
            ))}
          </Card>
        )}
      </div>
    </main>
  );
}

const Card = ({ title, children }: any) => (
  <section style={{
    background: PAPER, border: `2px solid ${INK}`, borderRadius: 20,
    padding: 20, marginBottom: 18, boxShadow: "8px 8px 0 rgba(35,31,26,.11)",
  }}>
    <h2 style={{ font: "600 15px/1 Georgia, serif", color: INK, marginBottom: 14 }}>{title}</h2>
    {children}
  </section>
);

function PersonRow({ person, note, children }: {
  person: Person & { first_name?: string; last_name?: string };
  note?: string; children?: React.ReactNode;
}) {
  const name = person.display_name
    ?? [person.first_name, person.last_name].filter(Boolean).join(" ")
    ?? person.username ?? "Someone";
  const initials = (name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 0", borderTop: `1px solid ${EDGE}`,
    }}>
      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: `2px solid ${INK}` }} />
      ) : (
        <span style={{
          width: 38, height: 38, borderRadius: "50%", border: `2px solid ${INK}`,
          background: GREEN, color: PAPER, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600,
        }}>{initials}</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, color: INK }}>{name}</span>
        <span style={{ display: "block", fontSize: 11.5, color: SOFT, marginTop: 2 }}>
          {person.username ? `@${person.username}` : ""}{note ? ` · ${note}` : ""}
        </span>
      </span>
      {children}
    </div>
  );
}

const btn = (quiet: boolean): React.CSSProperties => ({
  padding: "7px 13px", borderRadius: 99, fontSize: 12, cursor: "pointer",
  border: quiet ? `2px solid ${EDGE}` : "none",
  background: quiet ? "transparent" : INK,
  color: quiet ? SOFT : PAPER,
  fontWeight: quiet ? 400 : 600,
});

const Muted = ({ children }: any) => (
  <p style={{ fontSize: 12.5, color: SOFT, padding: "8px 0" }}>{children}</p>
);
