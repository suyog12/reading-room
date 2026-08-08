"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractPdf, extractImages, prepareVideos, compressVideo, type ExtractedPage } from "@/lib/pdf/extract";
import { BOOKS_PER_CASE, MAX_FILE_BYTES, MAX_VIDEO_BYTES } from "@/lib/constants";

/* Palette stays with the room: warm paper, ink, forest, book cloth. The shape
   is what carries the personality — fat radii, a hard offset shadow, chunky
   pills — rather than a gradient that would belong to some other app. */
const INK = "#231F1A", PAPER = "#FFFDF8", LINE = "#231F1A";
const GREEN = "#2F5E4E", SOFT = "#7C736A", WASH = "#F3EFE7";

const CLOTH = [
  { hex: "#7A3230", name: "Brick" },
  { hex: "#2F5E4E", name: "Forest" },
  { hex: "#2B3C5C", name: "Navy" },
  { hex: "#96702C", name: "Ochre" },
  { hex: "#523052", name: "Plum" },
  { hex: "#1F4E4E", name: "Teal" },
  { hex: "#8A5B2E", name: "Tan" },
  { hex: "#414651", name: "Slate" },
];

type Kind = "deck" | "photos" | "videos" | "notebook";
type Layout = "notes" | "facing" | "continuous";

export default function AddBookFlow({
  caseId, takenSlots, onDone, createNotebook,
}: {
  caseId: string;
  takenSlots: number;
  onDone: () => void;
  createNotebook: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [color, setColor] = useState(CLOTH[0].hex);
  const [layout, setLayout] = useState<Layout>("notes");
  const [shrink, setShrink] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const full = takenSlots >= BOOKS_PER_CASE;
  const isNotebook = kind === "notebook";
  const steps = isNotebook ? ["Kind", "Details", "Cover"] : ["Kind", "Files", "Details", "Cover"];
  const last = steps.length - 1;

  const canNext = () => {
    if (step === 0) return kind !== null;
    if (!isNotebook && step === 1) return files.length > 0;
    const detailStep = isNotebook ? 1 : 2;
    if (step === detailStep) return title.trim().length > 0;
    return true;
  };

  const pickFiles = (list: FileList | null) => {
    const arr = Array.from(list ?? []);
    const big = arr.find((f) =>
      f.size > (f.type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_FILE_BYTES));
    if (big) {
      setError(`${big.name} is bigger than the limit (50MB for images, 200MB for video)`);
      return;
    }
    setError(null);
    setFiles(arr);
  };

  const finish = async () => {
    setBusy(true); setError(null); setPct(0);
    try {
      if (isNotebook) {
        setStatus("Binding a blank notebook");
        const fd = new FormData();
        fd.set("title", title.trim());
        fd.set("caseId", caseId);
        fd.set("position", String(takenSlots));
        await createNotebook(fd);
        return;
      }

      const supabase = createClient();
      setStatus("Reading your pages");
      const isPdf = files.length === 1 && files[0].type === "application/pdf";
      const pages: ExtractedPage[] =
        kind === "videos"
          ? await prepareVideos(files, (d, t) => { setPct(Math.round((d / t) * 25)); setStatus(`Reading clip ${d} of ${t}`); })
          : isPdf
          ? await extractPdf(files[0], (d, t) => { setPct(Math.round((d / t) * 45)); setStatus(`Rendering page ${d} of ${t}`); })
          : await extractImages(files, (d, t) => { setPct(Math.round((d / t) * 45)); setStatus(`Processing image ${d} of ${t}`); });

      // Optional re-encode. Real time, so only worth it when asked for.
      if (kind === "videos" && shrink) {
        for (let i = 0; i < pages.length; i++) {
          setStatus(`Shrinking clip ${i + 1} of ${pages.length}`);
          const { blob, contentType } = await compressVideo(
            pages[i].full as File,
            (f) => setPct(25 + Math.round(((i + f) / pages.length) * 25))
          );
          pages[i].full = blob;
          pages[i].contentType = contentType;
        }
      }

      setStatus("Making the book");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: book, error: bookErr } = await supabase
        .from("books")
        .insert({
          case_id: caseId, owner_id: user!.id, title: title.trim(),
          author: author.trim() || null, spine_color: color,
          layout, position: takenSlots,
        })
        .select("id").single();
      if (bookErr) throw bookErr;

      const presign = await fetch("/api/upload/presign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookId: book.id,
          items: pages.map((p) => ({
            pageId: p.pageId, bytes: p.full.size,
            thumbBytes: p.thumb.size, contentType: p.contentType,
          })),
        }),
      }).then((r) => r.json());
      if (presign.error) throw new Error(presign.error);

      const jobs = presign.signed as { pageId: string; ext: string; pageUrl: string; thumbUrl: string }[];
      const queue = [...jobs];
      let done = 0;
      const put = async (url: string, blob: Blob, type: string) => {
        const res = await fetch(url, { method: "PUT", body: blob, headers: { "content-type": type } });
        if (!res.ok) throw new Error(`R2 refused the upload (${res.status})`);
      };
      const worker = async () => {
        while (queue.length) {
          const job = queue.shift()!;
          const page = pages.find((p) => p.pageId === job.pageId)!;
          // The content type is part of the signature, so it has to match.
          await put(job.pageUrl, page.full, page.contentType);
          await put(job.thumbUrl, page.thumb, "image/webp");
          done++;
          setPct(45 + Math.round((done / jobs.length) * 50));
          setStatus(`Shelving page ${done} of ${jobs.length}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      setStatus("Almost there");
      const commit = await fetch(`/api/books/${book.id}/commit`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pages: pages.map((p) => {
            const job = jobs.find((j) => j.pageId === p.pageId)!;
            return { pageId: p.pageId, ext: job.ext, mediaType: p.mediaType, durationMs: p.durationMs };
          }),
        }),
      }).then((r) => r.json());
      if (commit.error) throw new Error(commit.error);

      setPct(100);
      setStatus("Done");
      setTimeout(() => { onDone(); router.refresh(); }, 500);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setBusy(false);
      setStatus(null);
    }
  };

  if (full) {
    return (
      <Bubble>
        <p style={{ fontSize: 14, color: INK, textAlign: "center", padding: "18px 0" }}>
          This case is full. {BOOKS_PER_CASE} books is all it holds.
        </p>
      </Bubble>
    );
  }

  return (
    <Bubble>
      {/* progress rail */}
      <div style={{ display: "flex", gap: 5, marginBottom: 20 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ flex: i === step ? 2.4 : 1, transition: "flex 300ms cubic-bezier(.2,.8,.3,1)" }}>
            <div style={{
              height: 6, borderRadius: 99,
              background: i < step ? GREEN : i === step ? INK : "#E0D9CD",
              transition: "background 250ms",
            }} />
            {i === step && (
              <div style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: SOFT, marginTop: 7 }}>
                {s}
              </div>
            )}
          </div>
        ))}
      </div>

      {busy ? (
        <Working pct={pct} status={status} />
      ) : (
        <>
          {step === 0 && (
            <Choices
              value={kind}
              onPick={(k) => { setKind(k); setStep(1); }}
              options={[
                { id: "deck", title: "A slide deck", sub: "PDF. Every page becomes a page.", glyph: <GlyphDeck /> },
                { id: "photos", title: "Photos", sub: "Any number. They land in order.", glyph: <GlyphPhotos /> },
                { id: "videos", title: "Video clips", sub: "Each clip becomes a page you can play.", glyph: <GlyphPlay /> },
                { id: "notebook", title: "An empty notebook", sub: "Nothing to upload. Just write.", glyph: <GlyphPen /> },
              ]}
            />
          )}

          {!isNotebook && step === 1 && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pickFiles(e.dataTransfer.files); }}
              style={{
                border: `2px dashed ${drag ? GREEN : "#CFC6B6"}`, borderRadius: 18,
                background: drag ? "rgba(47,94,78,.06)" : WASH,
                padding: "30px 20px", textAlign: "center", transition: "all 200ms",
              }}
            >
              <div style={{ font: "600 16px/1.3 Georgia, serif", color: INK }}>
                {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} ready` : "Drop it here"}
              </div>
              <div style={{ fontSize: 12, color: SOFT, margin: "6px 0 14px" }}>
                {files.length ? files.map((f) => f.name).join(", ").slice(0, 60) : "or pick from your computer"}
              </div>
              <label style={{
                display: "inline-block", padding: "9px 18px", borderRadius: 99, cursor: "pointer",
                background: INK, color: PAPER, fontSize: 13, fontWeight: 500,
              }}>
                Choose {kind === "deck" ? "a PDF" : kind === "videos" ? "clips" : "photos"}
                <input type="file" hidden multiple={kind !== "deck"}
                  accept={kind === "deck" ? "application/pdf" : kind === "videos" ? "video/mp4,video/webm,video/quicktime" : "image/*"}
                  onChange={(e) => pickFiles(e.target.files)} />
              </label>
            </div>
          )}

          {!isNotebook && kind === "videos" && step === 1 && files.length > 0 && (
            <label style={{
              display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14,
              padding: "11px 12px", borderRadius: 13, cursor: "pointer",
              border: `2px solid ${shrink ? INK : "#E4DED2"}`,
              background: shrink ? WASH : "transparent",
            }}>
              <input type="checkbox" checked={shrink} onChange={(e) => setShrink(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                <span style={{ display: "block", fontSize: 13, color: INK }}>Shrink before uploading</span>
                <span style={{ display: "block", fontSize: 11.5, color: SOFT, marginTop: 2, lineHeight: 1.5 }}>
                  Re-encodes to 1280px. Takes about as long as the clip runs, and
                  usually saves most of the size. Turn it off to upload as is.
                </span>
              </span>
            </label>
          )}

          {step === (isNotebook ? 1 : 2) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="What's it called?" value={title} onChange={setTitle} placeholder="Give it a name" big />
              {!isNotebook && (
                <Field label="By whom?" value={author} onChange={setAuthor} placeholder="Optional" />
              )}
            </div>
          )}

          {step === last && (
            <div>
              <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: SOFT, marginBottom: 10 }}>
                Pick a cloth
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {CLOTH.map((c) => (
                  <button key={c.hex} onClick={() => setColor(c.hex)} title={c.name}
                    style={{
                      width: 38, height: 52, borderRadius: "3px 5px 5px 3px", cursor: "pointer",
                      background: `linear-gradient(90deg, rgba(0,0,0,.3) 0 2px, rgba(255,255,255,.2) 3px, ${c.hex} 18%, ${c.hex})`,
                      border: color === c.hex ? `2px solid ${INK}` : "2px solid transparent",
                      transform: color === c.hex ? "translateY(-5px)" : "none",
                      transition: "transform 200ms cubic-bezier(.2,.85,.3,1), border 150ms",
                    }} />
                ))}
              </div>

              {!isNotebook && (
                <>
                  <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: SOFT, marginBottom: 10 }}>
                    How should it read?
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[
                      { id: "notes", t: "Slide right, notes left", s: "Room to write beside every page" },
                      { id: "facing", t: "An image on every page", s: "Two at a time, like an album" },
                      { id: "continuous", t: "One image across both", s: "Spans the whole spread" },
                    ].map((o) => (
                      <button key={o.id} onClick={() => setLayout(o.id as Layout)}
                        style={{
                          textAlign: "left", padding: "11px 13px", borderRadius: 13, cursor: "pointer",
                          border: `2px solid ${layout === o.id ? INK : "#E4DED2"}`,
                          background: layout === o.id ? WASH : "transparent",
                          transition: "all 160ms",
                        }}>
                        <div style={{ fontSize: 13.5, color: INK, fontWeight: 500 }}>{o.t}</div>
                        <div style={{ fontSize: 11.5, color: SOFT, marginTop: 2 }}>{o.s}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 14, padding: "10px 12px", borderRadius: 12,
              background: "#FBEFEC", border: "1px solid #E7C4BB", fontSize: 12.5, color: "#8A3A2B",
            }}>
              {error}
            </div>
          )}

          {/* footer */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
            <button onClick={() => (step === 0 ? onDone() : setStep(step - 1))}
              style={{
                padding: "10px 16px", borderRadius: 99, cursor: "pointer",
                border: `2px solid #E4DED2`, background: "transparent", color: SOFT, fontSize: 13,
              }}>
              {step === 0 ? "Not now" : "Back"}
            </button>
            <div style={{ flex: 1 }} />
            {step > 0 && (
              <button
                onClick={() => (step === last ? finish() : setStep(step + 1))}
                disabled={!canNext()}
                style={{
                  padding: "11px 22px", borderRadius: 99, border: "none",
                  cursor: canNext() ? "pointer" : "default",
                  background: canNext() ? INK : "#D8D1C5", color: PAPER,
                  fontSize: 14, fontWeight: 600,
                  boxShadow: canNext() ? "0 4px 0 rgba(35,31,26,.25)" : "none",
                  transition: "all 160ms",
                }}>
                {step === last ? (isNotebook ? "Start writing" : "Put it on the shelf") : "Next"}
              </button>
            )}
          </div>
        </>
      )}
    </Bubble>
  );
}

/* ---------- pieces ---------- */

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        background: PAPER, border: `2px solid ${LINE}`, borderRadius: 26,
        padding: "22px 22px 20px", boxShadow: "10px 10px 0 rgba(35,31,26,.13)",
      }}>
        {children}
      </div>
      {/* the tail, so it reads as a speech bubble pointing at the case */}
      <div style={{
        position: "absolute", left: 46, bottom: -13, width: 24, height: 24,
        background: PAPER, borderRight: `2px solid ${LINE}`, borderBottom: `2px solid ${LINE}`,
        transform: "rotate(45deg)", borderRadius: "0 0 5px 0",
      }} />
    </div>
  );
}

function Choices({
  value, onPick, options,
}: {
  value: Kind | null;
  onPick: (k: Kind) => void;
  options: { id: string; title: string; sub: string; glyph: React.ReactNode }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onPick(o.id as Kind)}
          style={{
            display: "flex", alignItems: "center", gap: 13, textAlign: "left",
            padding: "13px 14px", borderRadius: 16, cursor: "pointer",
            border: `2px solid ${value === o.id ? INK : "#E4DED2"}`,
            background: value === o.id ? WASH : "transparent",
            transition: "all 160ms",
          }}>
          <span style={{
            width: 42, height: 42, borderRadius: 12, background: WASH,
            display: "grid", placeItems: "center", flexShrink: 0,
          }}>{o.glyph}</span>
          <span>
            <span style={{ display: "block", fontSize: 14.5, color: INK, fontWeight: 600 }}>{o.title}</span>
            <span style={{ display: "block", fontSize: 12, color: SOFT, marginTop: 2 }}>{o.sub}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, big,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; big?: boolean }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: SOFT }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={big}
        style={{
          width: "100%", marginTop: 7, padding: "11px 13px", borderRadius: 13,
          border: "2px solid #E4DED2", background: WASH, color: INK,
          font: big ? "600 17px/1.2 Georgia, serif" : "400 14px/1.2 system-ui",
          outline: "none",
        }} />
    </label>
  );
}

function Working({ pct, status }: { pct: number; status: string | null }) {
  return (
    <div style={{ padding: "18px 0 8px", textAlign: "center" }}>
      <div style={{ font: "600 19px/1.2 Georgia, serif", color: INK }}>{status ?? "Working"}</div>
      <div style={{ height: 12, borderRadius: 99, background: "#EDE7DC", margin: "18px 0 10px", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 99,
          background: `linear-gradient(90deg, ${GREEN}, #4E8A72)`,
          transition: "width 260ms cubic-bezier(.3,.8,.4,1)",
        }} />
      </div>
      <div style={{ fontSize: 12, color: SOFT }}>{pct}%</div>
    </div>
  );
}

/* small line glyphs, no icon dependency */
const stroke = { stroke: INK, strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const };

const GlyphDeck = () => (
  <svg width="21" height="21" viewBox="0 0 22 22"><rect x="3" y="4" width="16" height="11" rx="1.5" {...stroke} /><path d="M8 19h6" {...stroke} /><path d="M11 15v4" {...stroke} /></svg>
);
const GlyphPhotos = () => (
  <svg width="21" height="21" viewBox="0 0 22 22"><rect x="3" y="5" width="16" height="12" rx="2" {...stroke} /><circle cx="8" cy="9.5" r="1.6" {...stroke} /><path d="M4 15l4.5-4 3 2.6L15 10l3 3" {...stroke} /></svg>
);
const GlyphPlay = () => (
  <svg width="21" height="21" viewBox="0 0 22 22"><rect x="3" y="5" width="16" height="12" rx="2" {...stroke} /><path d="M10 9.5l3.5 2-3.5 2z" {...stroke} /></svg>
);
const GlyphPen = () => (
  <svg width="21" height="21" viewBox="0 0 22 22"><path d="M4 18l1-4 9-9 3 3-9 9z" {...stroke} /><path d="M13 5l3 3" {...stroke} /><path d="M4 18h5" {...stroke} /></svg>
);
