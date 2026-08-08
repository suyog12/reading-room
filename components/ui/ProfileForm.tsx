"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INK = "#231F1A", PAPER = "#FFFDF8", WASH = "#F3EFE7";
const SOFT = "#7C736A", EDGE = "#E4DED2", GREEN = "#2F5E4E";

type Profile = {
  first_name?: string | null; last_name?: string | null;
  username?: string | null; dob?: string | null;
  email?: string; display_name?: string | null; status?: string | null;
};

export default function ProfileForm({
  profile, avatarUrl,
}: { profile: Profile; avatarUrl: string | null }) {
  const router = useRouter();
  const [first, setFirst] = useState(profile.first_name ?? "");
  const [last, setLast] = useState(profile.last_name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [dob, setDob] = useState(profile.dob ?? "");
  const [avatar, setAvatar] = useState(avatarUrl);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  const saveDetails = async () => {
    setBusy(true); setError(null); setSavedAt(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({
      first_name: first.trim() || null,
      last_name: last.trim() || null,
      username: username.trim() || null,
      dob: dob || null,
    }).eq("id", user!.id);
    setBusy(false);
    if (error) {
      setError(/profiles_username_key|duplicate/i.test(error.message)
        ? "That username is taken."
        : /username_shape/i.test(error.message)
        ? "Usernames are 3 to 30 characters: letters, numbers, dot, underscore, hyphen."
        : error.message);
    } else {
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    }
  };

  const uploadAvatar = async (f: File) => {
    setBusy(true); setError(null);
    try {
      // Square it off and shrink before uploading — a phone photo is far
      // bigger than a 44px circle ever needs.
      const bitmap = await createImageBitmap(f);
      const side = Math.min(bitmap.width, bitmap.height, 512);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = side;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      const sx = (bitmap.width - Math.min(bitmap.width, bitmap.height)) / 2;
      const sy = (bitmap.height - Math.min(bitmap.width, bitmap.height)) / 2;
      const src = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, sx, sy, src, src, 0, 0, side, side);
      bitmap.close();

      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/webp", 0.9)
      );

      const signed = await fetch("/api/profile/avatar", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bytes: blob.size }),
      }).then((r) => r.json());
      if (signed.error) throw new Error(signed.error);

      const put = await fetch(signed.url, {
        method: "PUT", body: blob, headers: { "content-type": "image/webp" },
      });
      if (!put.ok) throw new Error(`Upload refused (${put.status})`);

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("profiles").update({ avatar_key: signed.key }).eq("id", user!.id);

      setAvatar(URL.createObjectURL(blob));
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const setPassword = async () => {
    setPwMsg(null);
    if (pw.length < 8) return setPwMsg("At least 8 characters.");
    if (pw !== pw2) return setPwMsg("Those don't match.");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setPwMsg(error.message);
    setPw(""); setPw2("");
    setPwMsg("Password set. You can now sign in with it.");
  };

  return (
    <main style={{ minHeight: "100vh", background: "#F1EEE8", fontFamily: "system-ui", padding: "40px 16px 80px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <Link href="/" style={{ fontSize: 12, color: SOFT, textDecoration: "none" }}>← Back to the building</Link>
        <h1 style={{ font: "600 24px/1.2 Georgia, serif", color: INK, margin: "14px 0 22px" }}>Your profile</h1>

        {/* picture */}
        <Card id="picture" title="Picture">
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {avatar ? (
              <img src={avatar} alt="" style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", border: `2px solid ${INK}` }} />
            ) : (
              <span style={{
                width: 76, height: 76, borderRadius: "50%", border: `2px solid ${INK}`,
                background: GREEN, color: PAPER, display: "grid", placeItems: "center", fontSize: 26, fontWeight: 600,
              }}>
                {(first[0] ?? "") + (last[0] ?? "")}
              </span>
            )}
            <div>
              <input ref={file} type="file" accept="image/*" hidden
                onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              <button onClick={() => file.current?.click()} disabled={busy} style={btn(busy)}>
                {busy ? "Working" : avatar ? "Replace picture" : "Upload a picture"}
              </button>
              <p style={{ fontSize: 11.5, color: SOFT, marginTop: 8 }}>
                Square crop, up to 4MB. Shrunk to 512px before upload.
              </p>
            </div>
          </div>
        </Card>

        {/* details */}
        <Card title="Details">
          <Row>
            <Field label="First name" value={first} onChange={setFirst} />
            <Field label="Last name" value={last} onChange={setLast} />
          </Row>
          <Field label="Username" value={username} onChange={setUsername} hint="People find you by this." />
          <Field label="Date of birth" value={dob} onChange={setDob} type="date" />
          <Field label="Email" value={profile.email ?? ""} onChange={() => {}} disabled
            hint="Changing your email isn't wired up yet." />
          <button onClick={saveDetails} disabled={busy} style={btn(busy)}>
            {busy ? "Saving" : "Save details"}
          </button>
          {savedAt && <Msg tone="good">Saved at {savedAt}.</Msg>}
          {error && <Msg tone="bad">{error}</Msg>}
        </Card>

        {/* password */}
        <Card id="password" title="Password">
          <p style={{ fontSize: 12.5, color: SOFT, marginBottom: 14, lineHeight: 1.55 }}>
            Set one and you can sign in with your username and password instead of
            waiting for an email. This works even if you've only ever used a link.
          </p>
          <Field label="New password" value={pw} onChange={setPw} type="password" />
          <Field label="Repeat it" value={pw2} onChange={setPw2} type="password" />
          <button onClick={setPassword} disabled={busy || !pw} style={btn(busy || !pw)}>
            {busy ? "Working" : "Set password"}
          </button>
          {pwMsg && <Msg tone={/set\./i.test(pwMsg) ? "good" : "bad"}>{pwMsg}</Msg>}
        </Card>
      </div>
    </main>
  );
}

const Card = ({ title, children, id }: any) => (
  <section id={id} style={{
    background: PAPER, border: `2px solid ${INK}`, borderRadius: 20,
    padding: 20, marginBottom: 18, boxShadow: "8px 8px 0 rgba(35,31,26,.11)",
  }}>
    <h2 style={{ font: "600 15px/1 Georgia, serif", color: INK, marginBottom: 16 }}>{title}</h2>
    {children}
  </section>
);

const Row = ({ children }: any) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>
);

const btn = (disabled: boolean): React.CSSProperties => ({
  padding: "10px 18px", borderRadius: 99, border: "none", fontSize: 13.5, fontWeight: 600,
  background: disabled ? "#D8D1C5" : INK, color: PAPER,
  cursor: disabled ? "default" : "pointer",
  boxShadow: disabled ? "none" : "0 4px 0 rgba(35,31,26,.25)", marginTop: 6,
});

const Msg = ({ tone, children }: any) => (
  <p style={{ fontSize: 12.5, marginTop: 12, color: tone === "good" ? GREEN : "#A33" }}>{children}</p>
);

function Field({
  label, value, onChange, type = "text", hint, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; hint?: string; disabled?: boolean;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 10.5, letterSpacing: ".13em", textTransform: "uppercase", color: SOFT }}>{label}</span>
      <input type={type} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 12,
          border: `2px solid ${EDGE}`, background: disabled ? "#EFEBE3" : WASH,
          color: disabled ? SOFT : INK, font: "400 15px system-ui", outline: "none",
        }} />
      {hint && <span style={{ display: "block", fontSize: 11.5, marginTop: 5, color: SOFT }}>{hint}</span>}
    </label>
  );
}
