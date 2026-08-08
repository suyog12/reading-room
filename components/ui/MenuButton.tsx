"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const INK = "#231F1A", PAPER = "#FFFDF8", WASH = "#F3EFE7", SOFT = "#7C736A", EDGE = "#E4DED2";

export default function MenuButton({
  name, username, isAdmin, approved, avatarUrl, signOut,
}: {
  name: string;
  username: string | null;
  isAdmin: boolean;
  approved: boolean;
  avatarUrl: string | null;
  signOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, the way a menu should behave.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div ref={box} style={{ position: "fixed", top: 16, right: 18, zIndex: 60, fontFamily: "system-ui" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        style={{
          display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
          background: "rgba(255,253,248,.94)", border: `2px solid ${INK}`, borderRadius: 99,
          padding: "5px 7px 5px 12px", boxShadow: "4px 4px 0 rgba(35,31,26,.13)",
          backdropFilter: "blur(6px)",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 17, height: 2, background: INK, borderRadius: 2 }} />
          ))}
        </span>
        <Avatar url={avatarUrl} initials={initials} size={28} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 52, right: 0, width: 268,
          background: PAPER, border: `2px solid ${INK}`, borderRadius: 18,
          boxShadow: "8px 8px 0 rgba(35,31,26,.13)", overflow: "hidden",
        }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 16, background: WASH }}>
            <Avatar url={avatarUrl} initials={initials} size={44} />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "600 15px/1.2 Georgia, serif", color: INK, overflow: "hidden", textOverflow: "ellipsis" }}>
                {name}
              </div>
              <div style={{ fontSize: 11.5, color: SOFT, marginTop: 2 }}>
                {username ? `@${username}` : "no username yet"}
              </div>
              {!approved && (
                <div style={{ fontSize: 10.5, color: "#A3762B", marginTop: 4, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  Waiting for approval
                </div>
              )}
            </div>
          </div>

          <Item href="/profile" onClick={() => setOpen(false)}>Manage profile</Item>
          <Item href="/profile#picture" onClick={() => setOpen(false)}>Change picture</Item>
          <Item href="/profile#password" onClick={() => setOpen(false)}>Set or change password</Item>
          <Item href="/people" onClick={() => setOpen(false)}>People</Item>
          {isAdmin && <Item href="/admin" onClick={() => setOpen(false)}>Accounts</Item>}

          <form action={signOut}>
            <button style={{
              width: "100%", textAlign: "left", padding: "13px 16px", fontSize: 13.5,
              background: "none", border: "none", borderTop: `1px solid ${EDGE}`,
              color: "#8A3A2B", cursor: "pointer",
            }}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Avatar({ url, initials, size }: { url: string | null; initials: string; size: number }) {
  return url ? (
    <img src={url} alt="" style={{
      width: size, height: size, borderRadius: "50%", objectFit: "cover",
      border: `2px solid ${INK}`, display: "block",
    }} />
  ) : (
    <span style={{
      width: size, height: size, borderRadius: "50%", border: `2px solid ${INK}`,
      background: "#2F5E4E", color: PAPER, display: "grid", placeItems: "center",
      fontSize: size * 0.36, fontWeight: 600, letterSpacing: ".02em",
    }}>{initials || "?"}</span>
  );
}

function Item({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} style={{
      display: "block", padding: "13px 16px", fontSize: 13.5, color: INK,
      textDecoration: "none", borderTop: `1px solid ${EDGE}`,
    }}>
      {children}
    </Link>
  );
}
