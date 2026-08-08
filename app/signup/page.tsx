"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const INK = "#231F1A", PAPER = "#FFFDF8", WASH = "#F3EFE7";
const SOFT = "#7C736A", EDGE = "#E4DED2", GREEN = "#2F5E4E";

export default function SignupPage() {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [uname, setUname] = useState<"idle" | "checking" | "free" | "taken" | "shape">("idle");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check the username as they type, but only after they stop.
  useEffect(() => {
    if (!username) return setUname("idle");
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) return setUname("shape");
    setUname("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?u=${encodeURIComponent(username)}`);
        const out = await res.json();
        setUname(out.ok ? "free" : out.reason === "taken" ? "taken" : "idle");
      } catch {
        // The database function may not exist yet. The unique index is the
        // real guard, so a failed check should never block signing up.
        setUname("idle");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [username]);

  const tooYoung = dob ? new Date(dob) > new Date(Date.now() - 13 * 365.25 * 864e5) : false;
  const mismatch = confirm.length > 0 && password !== confirm;
  const weak = password.length > 0 && password.length < 8;

  const ready = Boolean(
    first.trim() && last.trim() && dob && !tooYoung &&
    email.includes("@") &&
    /^[A-Za-z0-9._-]{3,30}$/.test(username) &&
    uname !== "taken" &&
    password.length >= 8 && password === confirm
  );

  const submit = async () => {
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          first_name: first.trim(),
          last_name: last.trim(),
          username: username.trim(),
          dob,
        },
      },
    });
    setBusy(false);
    if (error) {
      setError(/duplicate|already registered/i.test(error.message)
        ? "That email or username is already in use."
        : error.message);
    } else setDone(true);
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F1EEE8", fontFamily: "system-ui", padding: "40px 16px" }}>
      <div style={{ width: 420, padding: 26, background: PAPER, border: `2px solid ${INK}`, borderRadius: 24, boxShadow: "10px 10px 0 rgba(35,31,26,.13)" }}>
        <Link href="/" style={{ fontSize: 12, color: SOFT, textDecoration: "none" }}>← The Reading Room</Link>

        {done ? (
          <>
            <h1 style={{ font: "600 21px/1.2 Georgia, serif", color: INK, margin: "14px 0 8px" }}>Nearly there</h1>
            <p style={{ fontSize: 13.5, lineHeight: 1.65, color: SOFT }}>
              Confirm your address using the email we just sent to <strong>{email}</strong>.
              After that your account waits for approval — you'll be able to sign in
              once it's let in.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ font: "600 21px/1.2 Georgia, serif", color: INK, margin: "14px 0 4px" }}>Request an account</h1>
            <p style={{ fontSize: 12.5, color: SOFT, marginBottom: 18, lineHeight: 1.5 }}>
              Accounts are approved by hand, so there's a wait after you confirm your email.
            </p>

            <Row>
              <Field label="First name" value={first} onChange={setFirst} />
              <Field label="Last name" value={last} onChange={setLast} />
            </Row>

            <Field label="Date of birth" value={dob} onChange={setDob} type="date"
              hint={tooYoung ? "You need to be at least 13." : undefined} bad={tooYoung} />

            <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" />

            <Field label="Username" value={username} onChange={setUsername} placeholder="how people find you"
              hint={
                uname === "taken" ? "Taken, try another." :
                uname === "shape" ? "3 to 30 characters: letters, numbers, dot, underscore, hyphen." :
                uname === "free" ? "Free." :
                uname === "checking" ? "Checking…" : undefined
              }
              bad={uname === "taken" || uname === "shape"}
              good={uname === "free"} />

            <Field label="Password" value={password} onChange={setPassword} type="password"
              hint={weak ? "At least 8 characters." : undefined} bad={weak} />

            <Field label="Repeat password" value={confirm} onChange={setConfirm} type="password"
              hint={mismatch ? "These don't match." : undefined} bad={mismatch} />

            <button onClick={submit} disabled={busy || !ready} style={{
              width: "100%", padding: 12, fontSize: 14, fontWeight: 600, borderRadius: 99, border: "none",
              background: busy || !ready ? "#D8D1C5" : INK, color: PAPER,
              cursor: busy || !ready ? "default" : "pointer",
              boxShadow: busy || !ready ? "none" : "0 4px 0 rgba(35,31,26,.25)", marginTop: 8,
            }}>
              {busy ? "Sending" : "Request access"}
            </button>

            {error && <p style={{ color: "#A33", fontSize: 12.5, marginTop: 12 }}>{error}</p>}

            <p style={{ fontSize: 12.5, color: SOFT, marginTop: 16, textAlign: "center" }}>
              Already have one? <Link href="/login" style={{ color: GREEN }}>Sign in</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

const Row = ({ children }: any) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>
);

function Field({
  label, value, onChange, type = "text", placeholder, hint, bad, good,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string; bad?: boolean; good?: boolean;
}) {
  return (
    <label style={{ display: "block", marginBottom: 11 }}>
      <span style={{ fontSize: 10.5, letterSpacing: ".13em", textTransform: "uppercase", color: SOFT }}>{label}</span>
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12,
          border: `2px solid ${bad ? "#D8A99E" : good ? "#9BBFAE" : EDGE}`,
          background: WASH, color: INK, font: "400 15px system-ui", outline: "none",
        }} />
      {hint && (
        <span style={{ display: "block", fontSize: 11.5, marginTop: 5, color: bad ? "#A33" : good ? GREEN : SOFT }}>
          {hint}
        </span>
      )}
    </label>
  );
}
