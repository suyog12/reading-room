"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import NoteEditor from "./NoteEditor";

type Page = { id: string; position: number; url: string | null; doc: any };
type Book = {
  id: string; title: string; author: string | null;
  spine_color: string; layout: string; kind?: string;
};

const RATIO = 1.42;   // page height / page width
const TURN = 780;

type Face =
  | { kind: "cover"; page?: Page }
  | { kind: "image"; page: Page; half?: "left" | "right" }
  | { kind: "note"; page: Page }
  | { kind: "end" };

/**
 * Page 1 of the upload is the cover, so content starts at index 1.
 *
 *  notes       leaf i: recto = content[i-1], verso = notes for content[i]
 *  facing      leaf i: recto = content[2i-1], verso = content[2i]
 *  continuous  leaf i: recto = right half of content[i-1], verso = left half of content[i]
 */
function buildLeaves(pages: Page[], layout: string, kind = "deck"): { recto: Face; verso: Face }[] {
  // A notebook has no cover image and no slides. Every face is a page you can
  // write on, recto and verso, exactly like a paper diary.
  if (kind === "notebook") {
    const count = Math.max(1, Math.ceil((pages.length + 1) / 2));
    return Array.from({ length: count }, (_, i) => ({
      recto: i === 0
        ? { kind: "cover" as const }
        : pages[2 * i - 1] ? { kind: "note" as const, page: pages[2 * i - 1] } : { kind: "end" as const },
      verso: pages[2 * i] ? { kind: "note" as const, page: pages[2 * i] } : { kind: "end" as const },
    }));
  }

  const cover = pages[0];
  const content = pages.slice(1);
  const n = content.length;

  if (layout === "facing") {
    const count = Math.max(1, Math.ceil((n + 1) / 2));
    return Array.from({ length: count }, (_, i) => ({
      recto: i === 0
        ? { kind: "cover" as const, page: cover }
        : content[2 * i - 1] ? { kind: "image" as const, page: content[2 * i - 1] } : { kind: "end" as const },
      verso: content[2 * i] ? { kind: "image" as const, page: content[2 * i] } : { kind: "end" as const },
    }));
  }

  return Array.from({ length: n + 1 }, (_, i) => ({
    recto: i === 0
      ? { kind: "cover" as const, page: cover }
      : layout === "continuous"
        ? { kind: "image" as const, page: content[i - 1], half: "right" as const }
        : { kind: "image" as const, page: content[i - 1] },
    verso: !content[i]
      ? { kind: "end" as const }
      : layout === "continuous"
        ? { kind: "image" as const, page: content[i], half: "left" as const }
        : { kind: "note" as const, page: content[i] },
  }));
}

export default function Reader({
  book, pages, canEdit, backHref,
}: {
  book: Book; pages: Page[]; canEdit: boolean; backHref: string;
}) {
  const router = useRouter();
  const [leaf, setLeaf] = useState(0);
  const [ready, setReady] = useState(false);
  const [font, setFont] = useState("lora");
  const [size, setSize] = useState(17);
  const [reduced, setReduced] = useState(false);
  const [dim, setDim] = useState({ pw: 330, ph: 470 });

  const leavesArr = useMemo(() => buildLeaves(pages, book.layout, book.kind), [pages, book.layout, book.kind]);
  const leaves = leavesArr.length;
  const contentCount = Math.max(0, pages.length - 1);

  // Fill the screen: as tall as fits, with the spread never wider than the
  // window. Recomputed on resize so the book grows with the browser.
  useEffect(() => {
    const fit = () => {
      const vh = window.innerHeight, vw = window.innerWidth;
      let ph = Math.min(vh * 0.76, 760);
      let pw = ph / RATIO;
      if (pw * 2 > vw * 0.9) { pw = (vw * 0.9) / 2; ph = pw * RATIO; }
      setDim({ pw: Math.round(pw), ph: Math.round(ph) });
    };
    fit();
    window.addEventListener("resize", fit);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const a = setTimeout(() => setReady(true), 40);
    const b = setTimeout(() => setLeaf(1), 620);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  useEffect(() => {
    const step = book.layout === "facing" ? 2 : 1;
    for (let k = 1; k <= 2; k++) {
      const p = pages[leaf * step + k];
      if (p?.url) { const img = new Image(); img.src = p.url; }
    }
  }, [leaf, pages, book.layout]);

  const next = useCallback(() => setLeaf((l) => Math.min(l + 1, leaves)), [leaves]);
  const prev = useCallback(() => setLeaf((l) => Math.max(l - 1, 0)), []);
  const shelve = useCallback(() => {
    setLeaf(0);
    setTimeout(() => router.push(backHref), reduced ? 0 : 460);
  }, [router, backHref, reduced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA") {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      if (e.key === "Escape") shelve();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, shelve]);

  const { pw: PW, ph: PH } = dim;
  const dur = reduced ? 0 : TURN;
  const shift = leaf === 0 ? -PW / 2 : leaf === leaves ? PW / 2 : 0;
  const showingNote = (book.kind === "notebook" || book.layout === "notes") && leaf > 0 && leaf < leaves;

  const renderFace = (face: Face, flipped: boolean, leafIndex: number) => {
    switch (face.kind) {
      case "cover":
        return (
          <div style={{
            position: "absolute", inset: 0, overflow: "hidden",
            background: `linear-gradient(150deg, ${book.spine_color}, rgba(0,0,0,.55))`,
          }}>
            {face.page?.url && (
              <>
                <img src={face.page.url} alt="" aria-hidden style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "cover", filter: "blur(30px) brightness(.7)", transform: "scale(1.18)",
                }} />
                <img src={face.page.url} alt="" style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain",
                }} />
              </>
            )}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.1) 42%, rgba(0,0,0,.22) 100%)",
            }} />
            <div style={{ position: "absolute", left: 26, right: 26, bottom: 26 }}>
              <div style={{ font: `700 ${Math.max(20, PW * 0.085)}px/1.15 Georgia, serif`, color: "#FFFCF6" }}>
                {book.title}
              </div>
              {book.author && (
                <div style={{ fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: "rgba(255,252,246,.75)", marginTop: 9 }}>
                  {book.author}
                </div>
              )}
            </div>
          </div>
        );

      case "image":
        if (!face.page.url) return null;
        if (face.half) {
          return (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              <img src={face.page.url} alt="" style={{
                position: "absolute", top: 0, height: "100%", width: PW * 2,
                left: face.half === "left" ? 0 : -PW, objectFit: "cover",
              }} />
            </div>
          );
        }
        if (!face.page.url) return null;
        if (book.layout === "facing") {
          // The whole picture, never cropped. A blurred, scaled copy fills the
          // margin so the page has no dead white bands around the image.
          return (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              <img src={face.page.url} alt="" aria-hidden style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", filter: "blur(26px) brightness(.82)", transform: "scale(1.15)",
              }} />
              <img src={face.page.url} alt="" style={{
                position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain",
              }} />
            </div>
          );
        }
        return (
          <div style={{ height: "100%", padding: "22px 22px 28px", position: "relative" }}>
            <img src={face.page.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            <span style={{ position: "absolute", bottom: 11, right: 22, fontSize: 8.5, letterSpacing: ".18em", color: "#A79E92" }}>
              {String(face.page.position).padStart(2, "0")}
            </span>
          </div>
        );

      case "note":
        return (
          <div style={{ height: "100%", padding: "28px 24px 18px 30px" }}>
            <NoteEditor
              pageId={face.page.id}
              doc={face.page.doc}
              editable={canEdit && (
                book.kind === "notebook"
                  ? (flipped && leafIndex === leaf - 1) || (!flipped && leafIndex === leaf)
                  : flipped && leafIndex === leaf - 1
              )}
              font={font}
              size={size}
            />
          </div>
        );

      default:
        return (
          <div style={{ height: "100%", display: "grid", placeItems: "center", fontSize: 10, letterSpacing: ".22em", color: "#A79E92" }}>
            END
          </div>
        );
    }
  };

  const board: React.CSSProperties = { position: "absolute", top: 0, width: PW, height: PH };
  const faceBase: React.CSSProperties = {
    position: "absolute", inset: 0,
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", overflow: "hidden",
  };
  const paper = (side: "recto" | "verso"): React.CSSProperties => ({
    background: side === "recto"
      ? "linear-gradient(to right, rgba(0,0,0,.19), rgba(0,0,0,0) 10%, rgba(0,0,0,0) 90%, rgba(0,0,0,.06)), #F6F1E6"
      : "linear-gradient(to left, rgba(0,0,0,.19), rgba(0,0,0,0) 10%, rgba(0,0,0,0) 90%, rgba(0,0,0,.06)), #F6F1E6",
  });

  return (
    <main style={{
      position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 18, fontFamily: "system-ui",
      background: "radial-gradient(120% 90% at 50% 34%, #3A342C, #17140F)",
    }}>
      <div style={{ perspective: PW * 8, perspectiveOrigin: "50% 46%" }}>
        <div style={{
          width: PW * 2, height: PH, position: "relative", transformStyle: "preserve-3d",
          transform: `rotateX(5deg) translateX(${shift}px) scale(${ready ? 1 : 0.92})`,
          opacity: ready ? 1 : 0,
          transition: `transform ${dur}ms cubic-bezier(.34,.03,.2,1), opacity 400ms ease`,
        }}>
          <div style={{ ...board, left: PW, borderRadius: "0 6px 6px 0", background: `linear-gradient(135deg, ${book.spine_color}, rgba(0,0,0,.55))`, boxShadow: "0 50px 90px rgba(0,0,0,.62)" }} />
          <div style={{ ...board, left: 0, borderRadius: "6px 0 0 6px", background: `linear-gradient(215deg, ${book.spine_color}, rgba(0,0,0,.55))` }} />
          <div style={{
            position: "absolute", right: -4, top: 6, bottom: 6, width: 5,
            background: "repeating-linear-gradient(to bottom, #E6DCC6 0 1px, #BEB097 1px 2px)",
            borderRadius: "0 2px 2px 0", opacity: leaf < leaves ? 1 : 0, transition: "opacity 300ms",
          }} />

          {leavesArr.map((lf, i) => {
            const flipped = i < leaf;
            return (
              <div key={i} style={{
                position: "absolute", left: PW, top: 0, width: PW, height: PH,
                transformStyle: "preserve-3d", transformOrigin: "left center",
                transform: `rotateY(${flipped ? -180 : 0}deg)`,
                transition: `transform ${dur}ms cubic-bezier(.42,.02,.24,1)`,
                zIndex: flipped ? leaves + i : leaves - i,
                willChange: "transform",
              }}>
                <div style={lf.recto.kind === "cover"
                  ? { ...faceBase, borderRadius: "0 6px 6px 0" }
                  : { ...faceBase, ...paper("recto") }}>
                  {renderFace(lf.recto, flipped, i)}
                </div>
                <div style={{ ...faceBase, ...paper("verso"), transform: "rotateY(180deg)" }}>
                  {renderFace(lf.verso, flipped, i)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: ready ? 1 : 0, transition: "opacity 400ms ease 300ms" }}>
        <Ctl onClick={prev} disabled={leaf === 0}>←</Ctl>
        <span style={{ fontSize: 11, letterSpacing: ".2em", color: "rgba(255,250,240,.7)", minWidth: 96, textAlign: "center" }}>
          {leaf === 0 ? "CLOSED" : leaf === leaves ? "END" : `${String(leaf).padStart(2, "0")} / ${String(leaves - 1).padStart(2, "0")}`}
        </span>
        <Ctl onClick={next} disabled={leaf === leaves}>→</Ctl>
        <span style={{ width: 1, height: 20, background: "rgba(255,255,255,.2)" }} />
        <Ctl onClick={shelve}>Shelve</Ctl>

        {showingNote && canEdit && (
          <>
            <span style={{ width: 1, height: 20, background: "rgba(255,255,255,.2)" }} />
            {[["lora", "Serif"], ["sans", "Sans"], ["mono", "Mono"]].map(([id, label]) => (
              <button key={id} onClick={() => setFont(id)}
                style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", color: font === id ? "#fff" : "rgba(255,255,255,.5)", borderBottom: `1px solid ${font === id ? "#fff" : "transparent"}` }}>
                {label}
              </button>
            ))}
            {[15, 17, 20, 24].map((s) => (
              <button key={s} onClick={() => setSize(s)}
                style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer", color: size === s ? "#fff" : "rgba(255,255,255,.45)" }}>
                {s}
              </button>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

function Ctl({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", minWidth: 46,
      padding: "9px 15px", borderRadius: 3,
      border: `1px solid rgba(255,255,255,${disabled ? ".12" : ".34"})`,
      background: disabled ? "transparent" : "rgba(255,255,255,.07)",
      color: `rgba(255,252,246,${disabled ? ".22" : ".95"})`,
      cursor: disabled ? "default" : "pointer",
    }}>{children}</button>
  );
}
