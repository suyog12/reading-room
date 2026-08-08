"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "link" | "code";

const INK = "#231F1A", PAPER = "#FFFDF8", WASH = "#F3EFE7";
const SOFT = "#7C736A", EDGE = "#E4DED2", GREEN = "#2F5E4E";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withPassword = async () => {
    setBusy(true); setError(null);
    try {
      const id = identifier.trim();
      let email = id;

      // A username has to be turned into an address first. Everything else
      // happens in the browser so the session cookie is written the same way
      // the magic link writes it.
      if (!id.includes("@")) {
        const res = await fetch("/api/auth/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: id }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.email) {
          setError(res.status === 500
            ? "Username lookup isn't set up on the server. Sign in with your email instead."
            : "Those details don't match.");
          return;
        }
        email = out.email;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(/invalid login/i.test(error.message)
          ? "Those details don't match."
          : error.message);
        return;
      }

      router.push("/");
      router.refresh();
    } catch (e: any) {
      setError(`Could not reach the server: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = async () => {
    setBusy(true); setError(null);
    try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) {
      setError(/not allowed|not found|invalid/i.test(error.message)
        ? "No account with that email."
        : error.message);
    } else setSent(true);
    } catch (e: any) {
      setError(`Could not reach the server: ${e?.message ?? e}`);
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email, token: code.trim(), type: "email",
    });
    setBusy(false);
    if (error) return setError("That code didn't work. Codes expire after an hour.");
    router.push("/");
    router.refresh();
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F1EEE8", fontFamily: "system-ui" }}>
      <div style={{ width: 372, padding: 26, background: PAPER, border: `2px solid ${INK}`, borderRadius: 24, boxShadow: "10px 10px 0 rgba(35,31,26,.13)" }}>
        <Link href="/" style={{ fontSize: 12, color: SOFT, textDecoration: "none" }}>← The Reading Room</Link>
        <h1 style={{ font: "600 21px/1.2 Georgia, serif", color: INK, margin: "14px 0 16px" }}>Sign in</h1>

        <div style={{ display: "flex", gap: 3, marginBottom: 18, background: WASH, padding: 3, borderRadius: 99 }}>
          {([["password", "Password"], ["link", "Email link"], ["code", "Email code"]] as [Mode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setError(null); setSent(false); }}
              style={{
                flex: 1, padding: "8px 0", fontSize: 12, borderRadius: 99, border: "none", cursor: "pointer",
                background: mode === m ? INK : "transparent", color: mode === m ? PAPER : SOFT,
              }}>{label}</button>
          ))}
        </div>

        {mode === "password" && (
          <>
            <Field label="Username or email" value={identifier} onChange={setIdentifier} placeholder="you or you@example.com" />
            <Field label="Password" value={password} onChange={setPassword} type="password"
              onEnter={() => identifier && password && withPassword()} />
            <Primary onClick={withPassword} disabled={busy || !identifier || !password}>
              {busy ? "Checking" : "Sign in"}
            </Primary>
          </>
        )}

        {mode === "link" && (sent ? (
          <Note>A link is on its way to <strong>{email}</strong>. It lasts an hour.</Note>
        ) : (
          <>
            <Field label="Email" value={email} onChange={setEmail} type="email"
              placeholder="you@example.com" onEnter={() => email && sendEmail()} />
            <Primary onClick={sendEmail} disabled={busy || !email}>
              {busy ? "Sending" : "Email me a link"}
            </Primary>
          </>
        ))}

        {mode === "code" && (sent ? (
          <>
            <Note>Enter the six digit code sent to <strong>{email}</strong>.</Note>
            <Field label="Code" value={code} onChange={setCode} placeholder="123456"
              onEnter={() => code && verifyCode()} />
            <Primary onClick={verifyCode} disabled={busy || code.trim().length < 6}>
              {busy ? "Checking" : "Sign in"}
            </Primary>
            <button onClick={() => setSent(false)} style={linkBtn}>Use a different email</button>
          </>
        ) : (
          <>
            <Field label="Email" value={email} onChange={setEmail} type="email"
              placeholder="you@example.com" onEnter={() => email && sendEmail()} />
            <Primary onClick={sendEmail} disabled={busy || !email}>
              {busy ? "Sending" : "Send me a code"}
            </Primary>
          </>
        ))}

        {error && <p style={{ color: "#A33", fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>{error}</p>}

        <p style={{ fontSize: 12.5, color: SOFT, marginTop: 18, textAlign: "center" }}>
          No account? <Link href="/signup" style={{ color: GREEN }}>Request one</Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, onEnter,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; onEnter?: () => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: 11 }}>
      <span style={{ fontSize: 10.5, letterSpacing: ".13em", textTransform: "uppercase", color: SOFT }}>{label}</span>
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        style={{
          width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12,
          border: `2px solid ${EDGE}`, background: WASH, color: INK,
          font: "400 15px system-ui", outline: "none",
        }} />
    </label>
  );
}

const Primary = ({ children, onClick, disabled }: any) => (
  <button onClick={onClick} disabled={disabled} style={{
    width: "100%", padding: 12, fontSize: 14, fontWeight: 600, borderRadius: 99, border: "none",
    background: disabled ? "#D8D1C5" : INK, color: PAPER,
    cursor: disabled ? "default" : "pointer",
    boxShadow: disabled ? "none" : "0 4px 0 rgba(35,31,26,.25)", marginTop: 4,
  }}>{children}</button>
);

const Note = ({ children }: any) => (
  <p style={{ fontSize: 13.5, lineHeight: 1.6, color: SOFT, marginBottom: 12 }}>{children}</p>
);

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: SOFT, fontSize: 12, marginTop: 10, textDecoration: "underline",
};
