"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import NoteEditor from "./NoteEditor";

type Page = {
  id: string; position: number; url: string | null; doc: any;
  media_type?: string | null; poster?: string | null;
  /** The viewer may not see this one. No key ever reached the browser. */
  locked?: boolean;
  /** The owner has hidden it. Always false for anyone else. */
  hidden?: boolean;
  /** The writing beside it, which hides separately from the page. */
  noteLocked?: boolean;
  noteHidden?: boolean;
};
type Book = {
  id: string; title: string; author: string | null;
  spine_color: string; layout: string; kind?: string;
  visibility?: string; created_at?: string;
};

/**
 * Starting shape only. The book measures its first page and adopts that
 * proportion, so an A4 PDF, a 16:9 deck and a square photo each get a book
 * the right shape instead of being letterboxed or cropped into a fixed one.
 */
const DEFAULT_RATIO = 1.42;
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
  book, pages, canEdit, backHref, setBookVisibility, setPageVisibility,
  setNoteVisibility, addPages, deleteBook,
}: {
  book: Book; pages: Page[]; canEdit: boolean; backHref: string;
  setBookVisibility?: (fd: FormData) => Promise<void>;
  setPageVisibility?: (fd: FormData) => Promise<void>;
  setNoteVisibility?: (fd: FormData) => Promise<void>;
  addPages?: (fd: FormData) => Promise<void>;
  deleteBook?: () => Promise<void>;
}) {
  const router = useRouter();
  const [leaf, setLeaf] = useState(0);
  const [ready, setReady] = useState(false);
  const [font, setFont] = useState("lora");
  const [size, setSize] = useState(17);
  const [reduced, setReduced] = useState(false);
  const [dim, setDim] = useState({ pw: 330, ph: 470 });
  const [ratio, setRatio] = useState(DEFAULT_RATIO);

  /**
   * A spread needs two pages side by side, which does not fit a phone. Below
   * this width the book becomes a single page you swipe through: the same
   * content and the same order, without pretending there is a gutter.
   */
  const [narrow, setNarrow] = useState(false);

  // Measure the first page we are allowed to see, then shape the book to it.
  useEffect(() => {
    const first = pages.find((p) => p.url && !p.locked);
    if (!first?.url) return;
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const r = img.naturalHeight / img.naturalWidth;
      // Sanity bounds: a page stays somewhere between wide and tall.
      setRatio(Math.min(1.6, Math.max(0.62, r)));
    };
    img.src = first.url;
  }, [pages]);

  const leavesArr = useMemo(() => buildLeaves(pages, book.layout, book.kind), [pages, book.layout, book.kind]);
  const leaves = leavesArr.length;

  /**
   * The desktop book pairs a recto and a verso on each leaf. Flattened, that
   * becomes: cover, then each leaf's recto followed by the verso that belongs
   * beside it — which is the order you would read them anyway.
   */
  const flat = useMemo(() => {
    const out: { face: Face; key: string }[] = [];
    leavesArr.forEach((lf, i) => {
      if (lf.recto.kind !== "end") out.push({ face: lf.recto, key: `r${i}` });
      if (lf.verso.kind !== "end") out.push({ face: lf.verso, key: `v${i}` });
    });
    return out;
  }, [leavesArr]);

  const [flatIndex, setFlatIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  const flatNext = () => setFlatIndex((i) => Math.min(flat.length - 1, i + 1));
  const flatPrev = () => setFlatIndex((i) => Math.max(0, i - 1));
  const contentCount = Math.max(0, pages.length - 1);

  // Fill the screen: as tall as fits, with the spread never wider than the
  // window. Recomputed on resize so the book grows with the browser.
  useEffect(() => {
    const fit = () => {
      const vh = window.innerHeight, vw = window.innerWidth;
      const isNarrow = vw < 820;
      setNarrow(isNarrow);

      if (isNarrow) {
        // One page, as large as the screen allows.
        let pw = vw * 0.92;
        let ph = pw * ratio;
        const maxH = vh * 0.68;
        if (ph > maxH) { ph = maxH; pw = ph / ratio; }
        setDim({ pw: Math.round(pw), ph: Math.round(ph) });
        return;
      }

      let ph = Math.min(vh * 0.76, 760);
      let pw = ph / ratio;
      if (pw * 2 > vw * 0.9) { pw = (vw * 0.9) / 2; ph = pw * ratio; }
      setDim({ pw: Math.round(pw), ph: Math.round(ph) });
    };
    fit();
    window.addEventListener("resize", fit);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    return () => window.removeEventListener("resize", fit);
  }, [ratio]);

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
      if (e.key === "ArrowRight") { e.preventDefault(); narrow ? flatNext() : next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); narrow ? flatPrev() : prev(); }
      if (e.key === "Escape") shelve();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, shelve, narrow, flat.length]);

  const { pw: PW, ph: PH } = dim;
  /** The media pages currently open, so downloading saves what you can see. */
  const visible: Page[] = (() => {
    const lf = leavesArr[leaf - 1];
    const cur = leavesArr[leaf];
    const out: Page[] = [];
    const take = (f: any) => {
      if (f?.kind === "image" && f.page?.url) out.push(f.page);
      if (f?.kind === "cover" && f.page?.url) out.push(f.page);
    };
    take(lf?.verso);
    take(cur?.recto);
    return out.filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i);
  })();

  /**
   * The pages whose WRITING is on screen. Separate from `visible`, which
   * tracks pictures — in a notebook there are no pictures at all, which is
   * why the note controls were never appearing.
   */
  const visibleNotes: Page[] = (() => {
    const out: Page[] = [];
    const take = (f: any) => {
      if (f?.kind === "note" && f.page) out.push(f.page);
    };
    take(leavesArr[leaf - 1]?.verso);
    take(leavesArr[leaf]?.recto);
    return out.filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i);
  })();

  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const download = async () => {
    if (!visible.length) return;
    setSaving(true);
    try {
      for (const p of visible) {
        const res = await fetch(`/api/pages/${p.id}/download`);
        if (!res.ok) continue;
        const { url } = await res.json();
        // The signed URL carries Content-Disposition, so this saves rather
        // than navigating away.
        const a = document.createElement("a");
        a.href = url;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 350));   // browsers throttle bursts
      }
    } finally {
      setSaving(false);
    }
  };

  const dur = reduced ? 0 : TURN;
  const shift = leaf === 0 ? -PW / 2 : leaf === leaves ? PW / 2 : 0;
  const showingNote = (book.kind === "notebook" || book.layout === "notes") && leaf > 0 && leaf < leaves;

  const renderFace = (face: Face, flipped: boolean, leafIndex: number) => {
    switch (face.kind) {
      case "cover":
        // No image behind it — a notebook, or a book whose first page cannot
        // be shown. Bind it in its own cloth with the title in gold.
        if (!face.page?.url) {
          const dated = book.created_at
            ? new Date(book.created_at).toLocaleDateString(undefined, {
                year: "numeric", month: "long", day: "numeric",
              })
            : null;
          return (
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(150deg, ${book.spine_color}, rgba(0,0,0,.55))`,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "40px 34px", textAlign: "center",
            }}>
              <span style={{ width: 58, height: 2, background: "#E7CE92", opacity: .8, marginBottom: 26 }} />

              <div style={{
                font: `700 ${Math.max(22, PW * 0.085)}px/1.2 Georgia, serif`,
                color: "#EBD6A6",
                textShadow: "0 2px 10px rgba(0,0,0,.45)",
                letterSpacing: ".01em",
              }}>
                {book.title}
              </div>

              {(book.author || dated) && (
                <div style={{
                  marginTop: 18, fontSize: 12, letterSpacing: ".18em",
                  textTransform: "uppercase", color: "rgba(235,214,166,.72)", lineHeight: 1.9,
                }}>
                  {book.author && <div>{book.author}</div>}
                  {dated && <div style={{ fontSize: 10.5, letterSpacing: ".2em" }}>{dated}</div>}
                </div>
              )}

              <span style={{ width: 58, height: 2, background: "#E7CE92", opacity: .8, marginTop: 26 }} />
            </div>
          );
        }
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
        if (face.page.hidden && face.page.url) {
          // The owner still sees it, dimmed, with a mark. Hiding something
          // you cannot then find again would be worse than useless.
          return (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              <img src={face.page.url} alt="" style={{
                width: "100%", height: "100%", objectFit: "contain", opacity: .3, filter: "grayscale(1)",
              }} />
              <span style={{
                position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
                background: "rgba(35,31,26,.86)", color: "#FFFDF8", borderRadius: 99,
                padding: "5px 12px", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase",
              }}>
                Hidden from guests
              </span>
            </div>
          );
        }
        if (face.page.locked) {
          return (
            <div style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center",
              background: "#F2EDE1",
            }}>
              <span style={{
                fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase",
                color: "#B3AA9E",
              }}>
                Private
              </span>
            </div>
          );
        }
        // A video page plays in place. Everything else renders as before.
        if (face.page.media_type === "video") {
          if (!face.page.url) return null;
          return (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#12100D" }}>
              <video
                src={face.page.url}
                poster={face.page.poster ?? undefined}
                controls
                playsInline
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
              />
            </div>
          );
        }
        // A notebook page carries no media, so there is nothing to draw. This
        // has to come before every branch below, both so notebooks work and so
        // the type narrows to a plain string for the img tags.
        if (!face.page.url) return null;
        const src = face.page.url;

        // Photos fill the page. Slides are contained, because cropping a slide
        // cuts off content, while cropping a photo just reframes it.
        if (face.half) {
          return (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              <img src={src} alt="" style={{
                position: "absolute", top: 0, height: "100%", width: PW * 2,
                left: face.half === "left" ? 0 : -PW, objectFit: "cover",
              }} />
            </div>
          );
        }
        if (book.layout === "facing") {
          // The whole picture, never cropped. A blurred, scaled copy fills the
          // margin so the page has no dead white bands around the image.
          return (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              <img src={src} alt="" aria-hidden style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                objectFit: "cover", filter: "blur(26px) brightness(.82)", transform: "scale(1.15)",
              }} />
              <img src={src} alt="" style={{
                position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain",
              }} />
            </div>
          );
        }
        return (
          <div style={{ height: "100%", padding: "22px 22px 28px", position: "relative" }}>
            <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            <span style={{ position: "absolute", bottom: 11, right: 22, fontSize: 8.5, letterSpacing: ".18em", color: "#A79E92" }}>
              {String(face.page.position).padStart(2, "0")}
            </span>
          </div>
        );

      case "note":
        if (face.page.noteLocked) {
          return (
            <div style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center",
              background: "#F2EDE1",
            }}>
              <span style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", color: "#B3AA9E" }}>
                Private
              </span>
            </div>
          );
        }
        return (
          <div style={{
            height: "100%", position: "relative",
            background: "linear-gradient(180deg, #FBF7EC, #F3EDE0)",
            opacity: face.page.noteHidden ? .45 : 1,
          }}>
            {face.page.noteHidden && (
              <span style={{
                position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
                background: "rgba(35,31,26,.86)", color: "#FFFDF8", borderRadius: 99,
                padding: "4px 11px", fontSize: 9, letterSpacing: ".18em",
                textTransform: "uppercase", zIndex: 2,
              }}>
                Writing hidden
              </span>
            )}
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

  if (narrow) {
    const current = flat[flatIndex];
    return (
      <main
        style={{
          position: "fixed", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "system-ui",
          background: "radial-gradient(120% 90% at 50% 34%, #3A342C, #17140F)",
          touchAction: "pan-y",
        }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) < 45) return;          // a tap, not a swipe
          dx < 0 ? flatNext() : flatPrev();
        }}
      >
        <div style={{
          width: PW, height: PH, position: "relative", overflow: "hidden",
          borderRadius: 6, background: "#F6F1E6",
          boxShadow: "0 24px 50px rgba(0,0,0,.5)",
        }}>
          {current && renderFace(current.face, true, flatIndex)}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Ctl onClick={flatPrev} disabled={flatIndex === 0}>←</Ctl>
          <span style={{ fontSize: 11, letterSpacing: ".18em", color: "rgba(255,250,240,.7)", minWidth: 74, textAlign: "center" }}>
            {flatIndex + 1} / {flat.length}
          </span>
          <Ctl onClick={flatNext} disabled={flatIndex >= flat.length - 1}>→</Ctl>
          <Ctl onClick={shelve}>Shelve</Ctl>
        </div>

        <span style={{ fontSize: 10.5, color: "rgba(255,250,240,.4)", letterSpacing: ".1em" }}>
          swipe to turn
        </span>
      </main>
    );
  }

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
        {canEdit && setPageVisibility && visible.map((p) => (
          // One control per page on screen. A spread shows two, each labelled
          // with its own number, so it is never ambiguous which one goes.
          <form action={setPageVisibility} key={p.id}>
            <input type="hidden" name="pageId" value={p.id} />
            <input type="hidden" name="visibility" value={p.hidden ? "open" : "hidden"} />
            <Ctl onClick={() => {}}>
              {p.hidden ? "Show" : "Hide"} {String(p.position).padStart(2, "0")}
            </Ctl>
          </form>
        ))}
        {canEdit && setNoteVisibility && visibleNotes.map((p) => (
          p.noteLocked ? null : (
            <form action={setNoteVisibility} key={`n-${p.id}`}>
              <input type="hidden" name="pageId" value={p.id} />
              <input type="hidden" name="visibility" value={p.noteHidden ? "open" : "hidden"} />
              <Ctl onClick={() => {}}>
                {p.noteHidden ? "Show writing" : "Hide writing"} {String(p.position).padStart(2, "0")}
              </Ctl>
            </form>
          )
        ))}
        {canEdit && addPages && book.kind === "notebook" && (
          <form action={addPages}>
            <Ctl onClick={() => {}}>+ 2 pages</Ctl>
          </form>
        )}
        {canEdit && setBookVisibility && (
          <form action={setBookVisibility}>
            <input type="hidden" name="visibility" value={book.visibility === "private" ? "open" : "private"} />
            <Ctl onClick={() => {}}>
              {book.visibility === "private" ? "Private" : "Make private"}
            </Ctl>
          </form>
        )}
        {canEdit && deleteBook && (
          confirming ? (
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, letterSpacing: ".1em", color: "#E9BFB4" }}>
                Delete for good?
              </span>
              <form action={deleteBook}>
                <button style={{
                  padding: "9px 15px", borderRadius: 3, cursor: "pointer",
                  border: "1px solid #C77", background: "rgba(160,60,45,.35)",
                  color: "#FFF3EF", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
                }}>Yes, delete</button>
              </form>
              <Ctl onClick={() => setConfirming(false)}>Keep</Ctl>
            </span>
          ) : (
            <Ctl onClick={() => setConfirming(true)}>Delete</Ctl>
          )
        )}
        {canEdit && visible.length > 0 && (
          <Ctl onClick={download} disabled={saving}>
            {saving ? "Saving" : visible.length > 1 ? "Save pages" : "Save page"}
          </Ctl>
        )}

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
