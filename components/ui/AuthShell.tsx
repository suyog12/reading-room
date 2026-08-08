"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export function AuthShell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F1EEE8", fontFamily: "system-ui" }}>
      <div style={{ width: 340, padding: 30, background: "#FAF8F4", border: "1px solid #E2DCD2", borderRadius: 8 }}>
        <Link href="/" style={{ fontSize: 12, color: "#9A9184", textDecoration: "none" }}>
          ← The Reading Room
        </Link>
        <h1 style={{ font: "600 22px/1.2 Georgia, serif", color: "#231F1A", margin: "14px 0 6px" }}>{title}</h1>
        <p style={{ fontSize: 13, color: "#6B6459", marginBottom: 20, lineHeight: 1.55 }}>{sub}</p>
        {children}
      </div>
    </main>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%", padding: 10, fontSize: 15, marginBottom: 10,
  border: "1px solid #C9C2B6", borderRadius: 4, background: "#fff",
};
export const buttonStyle = (busy: boolean): CSSProperties => ({
  width: "100%", padding: 11, fontSize: 14,
  background: busy ? "#8A9E94" : "#2F5E4E", color: "#fff",
  border: "none", borderRadius: 4, cursor: busy ? "default" : "pointer",
});
export const errStyle: CSSProperties = { color: "#A33", fontSize: 13, marginTop: 12, lineHeight: 1.5 };
export const footStyle: CSSProperties = { fontSize: 13, color: "#6B6459", marginTop: 18, textAlign: "center" };
export const linkStyle: CSSProperties = { color: "#2F5E4E" };
