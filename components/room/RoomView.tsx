"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import RoomStage, { C, FLOOR_SHARE } from "@/components/space/RoomStage";
import AddBookFlow from "@/components/upload/AddBookFlow";
import { BOOKS_PER_CASE, MAX_CASES_PER_ROOM, SHELVES_PER_CASE, SLOTS_PER_SHELF, VISIBLE_SHELVES } from "@/lib/constants";
import { Bubble, BubbleTitle, BubbleHint, BubbleButtons, bubbleInput, bubbleSelect, SOFT } from "@/components/ui/Bubble";

type Case = { id: string; label: string; tone: string; position: number };
type Book = {
  id: string; case_id: string; title: string; author: string | null;
  spine_color: string; layout: string; page_count: number; position: number;
};

const TONES: Record<string, { body: string; lip: string; dark: string; inner: string }> = {
  oak:    { body: "#C9A26B", lip: "#E3C48D", dark: "#9C7846", inner: "#8B6A3E" },
  walnut: { body: "#8A6440", lip: "#A67E56", dark: "#5F432A", inner: "#4E3722" },
  black:  { body: "#242220", lip: "#3A3734", dark: "#141312", inner: "#0F0E0D" },
};

const SLOT_W = 78, SHELF_H = 252, POST = 14, PLANK = 18, CASE_D = 150;
const UNIT_W = SLOT_W * SLOTS_PER_SHELF + POST * 2 + 14;   // 432
const CASE_H = SHELF_H * SHELVES_PER_CASE;                  // 1260
const CASE_BOTTOM = 44;               // how far the case sits off the floor


/**
 * Shelf pages: two at a time, stepping by two, with the last page pulled back
 * so it still shows a full pair instead of one shelf and a gap.
 */
const PAGES: number[] = (() => {
  const out: number[] = [];
  for (let p = 0; p + VISIBLE_SHELVES <= SHELVES_PER_CASE; p += VISIBLE_SHELVES) out.push(p);
  const last = SHELVES_PER_CASE - VISIBLE_SHELVES;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
})();

/** Two cases on each of three walls. The fourth wall is the way out. */
const WALL_CASES: Record<number, number[]> = { 0: [0, 1], 1: [2, 3], 2: [4, 5] };
const WALL_NAME = ["Shelves", "More shelves", "More shelves", "The way out"];

export default function RoomView({
  room, cases, books, selectedCase, canEdit,
  createCase, createNotebook, renameRoom, renameCase,
}: {
  room: { id: string; name: string; floor: number };
  cases: Case[];
  books: Book[];
  selectedCase: string | null;
  canEdit: boolean;
  createCase: (fd: FormData) => Promise<void>;
  createNotebook: (fd: FormData) => Promise<void>;
  renameRoom: (fd: FormData) => Promise<void>;
  renameCase: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [turn, setTurn] = useState(0);
  const [dir, setDir] = useState(1);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [making, setMaking] = useState<number | null>(null);
  const [renamingRoom, setRenamingRoom] = useState(false);
  const [renamingCase, setRenamingCase] = useState<Case | null>(null);

  const selected = cases.find((c) => c.id === selectedCase) ?? null;
  const booksIn = (id: string) => books.filter((b) => b.case_id === id);
  const select = (id: string | null) =>
    router.push(id ? `/room/${room.id}?case=${id}` : `/room/${room.id}`);

  /**
   * Camera, worked out in screen pixels rather than wall units.
   *
   * The stage anchors the wall to the floor line. So a shelf band's position
   * on screen is: floor line, minus how far that band sits above the bottom
   * of the case, times the current scale. Centring it is then a plain
   * subtraction, and it stays right at any window size because every term is
   * measured from the window itself.
   */
  const [shiftY, setShiftY] = useState(0);

  const focusIndex = selected ? (WALL_CASES[turn] ?? []).indexOf(selected.position) : -1;

  /**
   * A wall with real bookcases is shown close up, two shelves filling the
   * window, because that is the size at which a spine is readable. Empty
   * walls and the door wall are shown whole, from across the room.
   */
  const hasCases = (WALL_CASES[turn] ?? []).some((pos) => cases.some((c) => c.position === pos));
  const stepped = hasCases;
  const focusShift = focusIndex >= 0 ? (focusIndex === 0 ? -(UNIT_W + 56) / 2 : (UNIT_W + 56) / 2) : 0;

  useEffect(() => {
    const fit = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const pairW = UNIT_W * 2 + 56;

      const z = stepped
        ? Math.min((vw * 0.88) / pairW, (vh * 0.78) / (VISIBLE_SHELVES * SHELF_H))
        : Math.min((vw * 0.80) / pairW, (vh * (1 - FLOOR_SHARE - 0.14)) / CASE_H);
      const nextZoom = Math.max(0.2, Math.min(z, 4));
      setZoom(nextZoom);

      if (!stepped) { setShiftY(0); return; }

      const floorY = vh * (1 - FLOOR_SHARE);
      const start = PAGES[page] ?? 0;
      // height of the middle of the visible pair, above the case's own bottom
      const aboveBottom = CASE_H - (start + VISIBLE_SHELVES / 2) * SHELF_H;
      const bandY = floorY - (CASE_BOTTOM + aboveBottom) * nextZoom;
      setShiftY(vh / 2 - bandY);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [stepped, page]);

  const step = useCallback((dir: number) => {
    setPage((p) => Math.min(PAGES.length - 1, Math.max(0, p + dir)));
  }, []);

  // A wheel gesture fires dozens of events. Accumulate, act once, then lock
  // briefly so one flick moves exactly one page.
  const acc = useRef(0);
  const locked = useRef(false);
  const onWheel = (e: React.WheelEvent) => {
    if (!stepped || locked.current) return;
    acc.current += e.deltaY;
    if (Math.abs(acc.current) < 55) return;
    step(acc.current > 0 ? 1 : -1);
    acc.current = 0;
    locked.current = true;
    setTimeout(() => { locked.current = false; }, 640);
  };

  const rotate = useCallback((d: number) => {
    setPage(0);
    setDir(d);
    if (selectedCase) select(null);   // stand back before turning
    setTurn((t) => (t + d + 4) % 4);
  }, [selectedCase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.key === "ArrowRight") { e.preventDefault(); rotate(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); rotate(-1); }
      if (!stepped) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); step(1); }
      if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotate, step, stepped]);

  const wallOf = (slot: number) => (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: CASE_BOTTOM,
      display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 56,
      transformStyle: "preserve-3d",
      transform: `translateX(${-focusShift}px)`,
      transition: "transform 620ms cubic-bezier(.3,.02,.2,1)",
    }}>
      {WALL_CASES[slot].map((pos) => {
        const unit = cases.find((c) => c.position === pos);
        if (!unit) {
          if (!canEdit) return <div key={pos} style={{ width: UNIT_W }} />;
          const bandTop = stepped ? (PAGES[page] ?? 0) * SHELF_H : SHELF_H;
          return (
            <button key={pos} onClick={() => setMaking(pos)} style={{
              width: UNIT_W, height: CASE_H, position: "relative", cursor: "pointer",
              border: `2px dashed ${C.faint}`, borderRadius: 6,
              background: "rgba(255,255,255,.2)", padding: 0,
            }}>
              {/* ghosted shelf lines, so the gap reads as a missing bookcase */}
              {Array.from({ length: SHELVES_PER_CASE }).map((_, r) => (
                <span key={r} style={{
                  position: "absolute", left: 10, right: 10, top: (r + 1) * SHELF_H - 2,
                  height: 2, background: "rgba(124,115,106,.18)",
                }} />
              ))}
              {/* the prompt sits in whichever pair of shelves you're looking at */}
              <span style={{
                position: "absolute", left: 0, right: 0,
                top: bandTop + SHELF_H - 14,
                fontSize: 15, letterSpacing: ".18em", textTransform: "uppercase", color: C.soft,
              }}>
                + bookcase
              </span>
            </button>
          );
        }
        return (
          <CaseUnit
            key={unit.id} unit={unit} books={booksIn(unit.id)}
            selected={unit.id === selectedCase}
            onSelect={() => select(unit.id === selectedCase ? null : unit.id)}
            onRename={() => setRenamingCase(unit)}
          />
        );
      })}
    </div>
  );

  return (
    <main
      onWheel={onWheel}
      style={{ position: "fixed", inset: 0, overflow: "hidden", fontFamily: "system-ui", background: C.wallBottom }}
    >
      <RoomStage zoom={zoom} shiftY={shiftY} turn={turn} dir={dir}>
        {WALL_CASES[turn] ? wallOf(turn) : (
          /* the way out: a full-height door standing on the floor */
          <div style={{
            position: "absolute", left: "50%", bottom: CASE_BOTTOM, marginLeft: -190,
            width: 380, transformStyle: "preserve-3d", textAlign: "center",
          }}>
            <button
              onClick={() => router.push(`/floor?f=${room.floor}`)}
              style={{
                width: 380, height: 820, cursor: "pointer", border: "none", padding: 0, position: "relative",
                background: `linear-gradient(100deg, ${C.woodDark}, ${C.wood} 52%, ${C.woodLip})`,
                boxShadow: "inset 0 0 0 5px rgba(0,0,0,.22), 0 26px 50px rgba(0,0,0,.32)",
              }}
            >
              <span style={{ position: "absolute", inset: "7% 12% 52%", border: "4px solid rgba(0,0,0,.18)" }} />
              <span style={{ position: "absolute", inset: "52% 12% 7%", border: "4px solid rgba(0,0,0,.18)" }} />
              <span style={{ position: "absolute", top: "50%", right: 30, width: 18, height: 18, borderRadius: "50%", background: "#EBD6A6", boxShadow: "0 3px 7px rgba(0,0,0,.45)" }} />
              <span style={{
                position: "absolute", top: "24%", left: "50%", transform: "translateX(-50%)",
                padding: "12px 20px", borderRadius: 2, whiteSpace: "nowrap",
                background: "linear-gradient(160deg, #E7CE92, #B8924A 55%, #8A6A32)",
                boxShadow: "0 1px 0 rgba(255,255,255,.35) inset, 0 3px 7px rgba(0,0,0,.45)",
                fontSize: 15, letterSpacing: ".16em", textTransform: "uppercase", color: "#2A1F08", fontWeight: 600,
              }}>
                Floor {room.floor}
              </span>
            </button>
          </div>
        )}
      </RoomStage>

      {/* chrome */}
      <div style={{ position: "absolute", top: 20, left: 26, zIndex: 5, display: "flex", alignItems: "baseline", gap: 12 }}>
        <button onClick={() => router.push(`/floor?f=${room.floor}`)}
          style={{ fontSize: 12, color: SOFT, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          ← Floor {room.floor}
        </button>
        <button onClick={() => canEdit && setRenamingRoom(true)} title={canEdit ? "Rename this room" : undefined}
          style={{ font: "600 16px/1 Georgia, serif", color: C.ink, background: "none", border: "none", cursor: canEdit ? "pointer" : "default", padding: 0 }}>
          {room.name}
        </button>
        <span style={{ fontSize: 11, color: SOFT }}>
          {cases.length}/{MAX_CASES_PER_ROOM} cases · {books.length} books
        </span>
      </div>

      {/* which wall you're facing */}
      <div style={{
        position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 7,
        display: "flex", alignItems: "center", gap: 14,
        background: "rgba(255,253,248,.92)", border: `2px solid ${C.ink}`, borderRadius: 99,
        padding: "7px 9px 7px 12px", boxShadow: "5px 5px 0 rgba(35,31,26,.13)",
      }}>
        <button onClick={() => rotate(-1)} style={turnBtn}>‹</button>
        <span style={{ fontSize: 11.5, letterSpacing: ".14em", textTransform: "uppercase", color: C.ink, minWidth: 118, textAlign: "center" }}>
          {WALL_NAME[turn]}
        </span>
        <span style={{ display: "flex", gap: 5 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{
              width: i === turn ? 16 : 6, height: 6, borderRadius: 99,
              background: i === turn ? C.ink : "#D6CEC1", transition: "all 250ms",
            }} />
          ))}
        </span>
        <button onClick={() => rotate(1)} style={turnBtn}>›</button>
      </div>

      {selected && (
        <button onClick={() => select(null)} style={{
          position: "absolute", top: 20, right: 26, zIndex: 9,
          padding: "9px 16px", borderRadius: 99, cursor: "pointer",
          border: `2px solid ${C.ink}`, background: "rgba(255,253,248,.92)",
          color: C.ink, fontSize: 12, letterSpacing: ".1em",
          boxShadow: "4px 4px 0 rgba(35,31,26,.13)",
        }}>
          ← Step back
        </button>
      )}

      {/* the cases on this wall, always reachable even when scrolled down */}
      {WALL_CASES[turn] && (
        <div style={{
          position: "absolute", bottom: 74, left: "50%", transform: "translateX(-50%)",
          zIndex: 7, display: "flex", gap: 8,
        }}>
          {WALL_CASES[turn].map((pos) => {
            const unit = cases.find((c) => c.position === pos);
            if (!unit) return null;
            const on = unit.id === selectedCase;
            return (
              <span key={unit.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: on ? C.ink : "rgba(255,253,248,.92)",
                border: `2px solid ${C.ink}`, borderRadius: 99, padding: "5px 6px 5px 13px",
                boxShadow: "4px 4px 0 rgba(35,31,26,.13)",
              }}>
                <button onClick={() => select(on ? null : unit.id)} style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase",
                  color: on ? "#FFFDF8" : C.ink,
                }}>
                  {unit.label}
                  <span style={{ opacity: .55, marginLeft: 7 }}>
                    {books.filter((b) => b.case_id === unit.id).length}/{BOOKS_PER_CASE}
                  </span>
                </button>
                <button onClick={() => setRenamingCase(unit)} title="Rename"
                  style={{
                    width: 22, height: 22, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: on ? "rgba(255,255,255,.2)" : "#F1ECE2", color: on ? "#FFFDF8" : C.ink,
                    fontSize: 11, lineHeight: 1,
                  }}>✎</button>
              </span>
            );
          })}
        </div>
      )}

      {/* which pair of shelves you're looking at */}
      {stepped && <div style={{
        position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)",
        zIndex: 5, display: "flex", flexDirection: "column", gap: 7, alignItems: "center",
      }}>
        {PAGES.map((start, i) => (
          <button key={i} onClick={() => setPage(i)}
            title={`Shelves ${start + 1} and ${start + 2}`}
            style={{
              width: 7, height: i === page ? 22 : 7, borderRadius: 99, border: "none", padding: 0,
              background: i === page ? C.ink : "rgba(0,0,0,.18)",
              cursor: "pointer", transition: "all 260ms cubic-bezier(.2,.8,.3,1)",
            }} />
        ))}
      </div>}

      {selected && canEdit && (
        <div style={{ position: "absolute", right: 26, top: "50%", transform: "translateY(-50%)", zIndex: 8, width: 400, maxHeight: "84vh", overflowY: "auto" }}>
          <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: SOFT, marginBottom: 9, paddingLeft: 6 }}>
            {selected.label}
          </div>
          <AddBookFlow
            key={selected.id}
            caseId={selected.id}
            takenSlots={booksIn(selected.id).length}
            onDone={() => select(null)}
            createNotebook={createNotebook}
          />
        </div>
      )}

      {making !== null && (
        <Overlay onClose={() => setMaking(null)}>
          <form action={createCase} onSubmit={() => setMaking(null)}>
            <input type="hidden" name="roomId" value={room.id} />
            <input type="hidden" name="position" value={making} />
            <Bubble tail="none">
              <BubbleTitle>Build a bookcase</BubbleTitle>
              <BubbleHint>Five shelves, five books a shelf. Twenty five in all.</BubbleHint>
              <input name="label" autoFocus placeholder="What goes in it?" style={bubbleInput} />
              <select name="tone" defaultValue="oak" style={bubbleSelect}>
                <option value="oak">Oak</option>
                <option value="walnut">Walnut</option>
                <option value="black">Black</option>
              </select>
              <BubbleButtons onCancel={() => setMaking(null)} submitLabel="Build it" />
            </Bubble>
          </form>
        </Overlay>
      )}

      {renamingRoom && (
        <Overlay onClose={() => setRenamingRoom(false)}>
          <form action={renameRoom} onSubmit={() => setRenamingRoom(false)}>
            <input type="hidden" name="roomId" value={room.id} />
            <Bubble tail="none">
              <BubbleTitle>Rename the room</BubbleTitle>
              <BubbleHint>Currently called {room.name}.</BubbleHint>
              <input name="name" autoFocus defaultValue={room.name} style={bubbleInput} />
              <BubbleButtons onCancel={() => setRenamingRoom(false)} submitLabel="Save" />
            </Bubble>
          </form>
        </Overlay>
      )}

      {renamingCase && (
        <Overlay onClose={() => setRenamingCase(null)}>
          <form action={renameCase} onSubmit={() => setRenamingCase(null)}>
            <input type="hidden" name="caseId" value={renamingCase.id} />
            <input type="hidden" name="roomId" value={room.id} />
            <Bubble tail="none">
              <BubbleTitle>Rename the bookcase</BubbleTitle>
              <BubbleHint>Currently called {renamingCase.label}.</BubbleHint>
              <input name="label" autoFocus defaultValue={renamingCase.label} style={bubbleInput} />
              <select name="tone" defaultValue={renamingCase.tone} style={bubbleSelect}>
                <option value="oak">Oak</option>
                <option value="walnut">Walnut</option>
                <option value="black">Black</option>
              </select>
              <BubbleButtons onCancel={() => setRenamingCase(null)} submitLabel="Save" />
            </Bubble>
          </form>
        </Overlay>
      )}
    </main>
  );
}

const turnBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer",
  background: "#F1ECE2", color: "#231F1A", fontSize: 17, lineHeight: 1,
};

function CaseUnit({
  unit, books, selected, onSelect, onRename,
}: { unit: Case; books: Book[]; selected: boolean; onSelect: () => void; onRename: () => void }) {
  const t = TONES[unit.tone] ?? TONES.oak;
  return (
    <div style={{ width: UNIT_W, transformStyle: "preserve-3d" }}>
      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") onSelect(); }}
        style={{
          width: "100%", height: CASE_H, position: "relative", cursor: "pointer",
          transformStyle: "preserve-3d",
          transform: selected ? "translateZ(22px)" : "none",
          transition: "transform 320ms cubic-bezier(.2,.8,.3,1)",
        }}
      >
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, ${t.inner}, rgba(0,0,0,.55))`,
          boxShadow: "inset 0 0 70px rgba(0,0,0,.55)",
          outline: selected ? `3px solid ${C.accent}` : "none", outlineOffset: 12,
        }} />
        <div style={{
          position: "absolute", top: 0, left: 0, width: CASE_D, height: CASE_H,
          transformOrigin: "left center", transform: "rotateY(-90deg)",
          background: `linear-gradient(to right, ${t.dark}, ${t.body} 70%, ${t.lip})`,
        }} />
        <div style={{
          position: "absolute", top: 0, right: 0, width: CASE_D, height: CASE_H,
          transformOrigin: "right center", transform: "rotateY(90deg)",
          background: `linear-gradient(to left, ${t.dark}, ${t.body} 70%, ${t.lip})`,
        }} />
        <div style={{
          position: "absolute", top: 0, left: 0, width: UNIT_W, height: CASE_D,
          transformOrigin: "center top", transform: "rotateX(90deg)",
          background: `linear-gradient(to bottom, ${t.dark}, ${t.body})`,
        }} />

        {Array.from({ length: SHELVES_PER_CASE }).map((_, r) => {
          const row = books.slice(r * SLOTS_PER_SHELF, r * SLOTS_PER_SHELF + SLOTS_PER_SHELF);
          return (
            <div key={r} style={{ position: "absolute", top: r * SHELF_H, left: 0, width: UNIT_W, height: SHELF_H, transformStyle: "preserve-3d" }}>
              <div style={{
                position: "absolute", left: POST + 6, right: POST, bottom: PLANK,
                height: SHELF_H - PLANK, display: "flex", alignItems: "flex-end",
                justifyContent: "flex-start", gap: 2, transformStyle: "preserve-3d",
              }}>
                {row.map((b, i) => <Spine key={b.id} book={b} i={r * SLOTS_PER_SHELF + i} />)}
              </div>
              <div style={{
                position: "absolute", bottom: PLANK, left: 0, width: UNIT_W, height: CASE_D,
                transformOrigin: "center top", transform: "rotateX(90deg)",
                background: `linear-gradient(to bottom, ${t.dark} 0%, ${t.body} 55%, ${t.lip} 100%)`,
              }} />
              <div style={{
                position: "absolute", bottom: 0, left: 0, width: UNIT_W, height: PLANK,
                transform: `translateZ(${CASE_D}px)`,
                background: `linear-gradient(to bottom, ${t.lip}, ${t.body} 45%, ${t.dark})`,
                boxShadow: "0 10px 20px rgba(0,0,0,.32)",
              }} />
            </div>
          );
        })}
      </div>


    </div>
  );
}

function isDark(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
}

function Spine({ book, i }: { book: Book; i: number }) {
  const router = useRouter();
  const [hover, setHover] = useState(false);

  const h = 196 + ((i * 13) % 32);
  const w = 56 + ((i * 7) % 22);
  const depth = 112;
  const rest = depth + 14;
  const dark = isDark(book.spine_color);
  const fg = dark ? "rgba(255,252,246,.97)" : "rgba(22,18,14,.92)";
  const rule = dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.35)";
  const titleSize = Math.min(19, Math.max(12, w * 0.27));

  return (
    <div style={{ position: "relative", transformStyle: "preserve-3d" }}>
      {hover && (
        <div style={{
          position: "absolute", bottom: h + 20, left: "50%",
          transform: "translateX(-50%) translateZ(150px)",
          background: "#fff", border: "1px solid #E2DCD2", borderRadius: 6, padding: "9px 13px",
          whiteSpace: "nowrap", zIndex: 30, boxShadow: "0 10px 24px rgba(0,0,0,.2)", pointerEvents: "none",
        }}>
          <div style={{ font: "600 14px/1.2 Georgia, serif", color: C.ink }}>{book.title}</div>
          <div style={{ fontSize: 11, color: SOFT, marginTop: 3 }}>
            {book.author ? `${book.author} · ` : ""}{book.page_count} pages
          </div>
        </div>
      )}

      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => { e.stopPropagation(); router.push(`/book/${book.id}`); }}
        title={book.title}
        style={{
          width: w, height: h, position: "relative", transformStyle: "preserve-3d", cursor: "pointer",
          transform: hover ? `translateZ(${rest + 62}px)` : `translateZ(${rest}px)`,
          transition: "transform 260ms cubic-bezier(.2,.85,.3,1)",
        }}
      >
        <div style={{
          position: "absolute", inset: 0, overflow: "hidden", borderRadius: "1px 3px 3px 1px",
          background: `linear-gradient(90deg, rgba(0,0,0,.4) 0 2px, rgba(255,255,255,.22) 4px, ${book.spine_color} 16%, ${book.spine_color} 76%, rgba(0,0,0,.3))`,
          boxShadow: "0 6px 14px rgba(0,0,0,.28)",
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "16px 0 13px",
        }}>
          <span style={{ width: "62%", height: 1.5, background: rule, flexShrink: 0 }} />
          <span style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 0" }}>
            <span style={{
              writingMode: "vertical-rl", transform: "rotate(180deg)",
              font: `600 ${titleSize}px/1 Georgia, serif`,
              letterSpacing: ".09em", textTransform: "uppercase", color: fg,
              textShadow: dark ? "0 1px 2px rgba(0,0,0,.5)" : "none",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxHeight: "100%",
            }}>
              {book.title}
            </span>
          </span>
          {book.author && (
            <>
              <span style={{ width: "38%", height: 1.5, background: rule, flexShrink: 0, marginBottom: 9 }} />
              <span style={{
                writingMode: "vertical-rl", transform: "rotate(180deg)",
                fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase",
                color: fg, opacity: .9, whiteSpace: "nowrap", overflow: "hidden",
                maxHeight: Math.min(90, h * 0.3), flexShrink: 0,
              }}>
                {book.author}
              </span>
            </>
          )}
          <span style={{
            marginTop: 11, width: "70%", height: 18, borderRadius: 2, flexShrink: 0,
            background: dark ? "rgba(255,255,255,.9)" : "rgba(0,0,0,.72)",
          }} />
        </div>

        <div style={{
          position: "absolute", top: 0, right: 0, width: depth, height: h,
          transformOrigin: "right center", transform: "rotateY(-90deg)",
          background: "linear-gradient(to left, #EFE7D6 0%, #DCD0B4 55%, #B9A88A)",
        }} />
        <div style={{
          position: "absolute", top: 0, left: 0, width: w, height: depth,
          transformOrigin: "center top", transform: "rotateX(-90deg)",
          background: "linear-gradient(to top, #EFE7D6, #C9BB9C)",
        }} />
      </div>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 30, display: "grid", placeItems: "center",
      background: "rgba(35,31,26,.28)", backdropFilter: "blur(3px)",
    }}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
