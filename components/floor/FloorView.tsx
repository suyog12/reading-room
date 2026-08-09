"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Space, { C, D, PROJ } from "@/components/space/Space";
import { Bubble, BubbleTitle, BubbleHint, BubbleButtons, bubbleInput, INK, SOFT, PAPER } from "@/components/ui/Bubble";

type Room = { id: string; name: string; floor: number; position: number; visibility?: string; locked?: boolean };

/** All four slots are visible without turning: two on the back wall, one each side. */
const SLOT_LABEL = ["Back left", "Back right", "Left wall", "Right wall"];

const DOOR_W = 230, DOOR_H = 430, JAMB = 38;

export default function FloorView({
  floor, topFloor, rooms, createRoom, renameRoom, canEdit = true, basePath = "/floor",
}: {
  floor: number;
  topFloor: number;
  rooms: Room[];
  createRoom: (fd: FormData) => Promise<void>;
  renameRoom: (fd: FormData) => Promise<void>;
  /** A guest sees the rooms but cannot build or rename. */
  canEdit?: boolean;
  /** "/floor" for your own building, "/u/name" when visiting. */
  basePath?: string;
}) {
  const router = useRouter();
  const [naming, setNaming] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<Room | null>(null);
  const [walking, setWalking] = useState<{ label: string } | null>(null);
  const [zoom, setZoom] = useState(1);

  /**
   * Going up or down keeps this same component mounted — only the search
   * param changes — so the walk overlay has to be cleared when the new floor
   * arrives, or it sits there forever with a door frozen mid-swing.
   */
  useEffect(() => { setWalking(null); }, [floor, rooms.length]);

  // Fill the window rather than merely fitting: the corridor was rendering
  // small with a lot of dead ceiling above it.
  useEffect(() => {
    const fit = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const contentW = 1240;   // two doorways plus the stairs between them
      const byWidth = (vw * 0.9) / (contentW * PROJ);
      const byHeight = (vh * 0.92) / (620 * PROJ);
      setZoom(Math.max(0.4, Math.min(byWidth, byHeight, 3)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const at = (n: number) => rooms.find((r) => r.position === n);
  const canGoUp = canEdit ? rooms.length > 0 : floor < topFloor;
  const canGoDown = floor > 1;

  const enter = (room: Room) => {
    setWalking({ label: room.name });
    setTimeout(() => router.push(`/room/${room.id}`), 720);
    setTimeout(() => setWalking(null), 2600);
  };

  const changeFloor = (to: number) => {
    setWalking({ label: `Floor ${to}` });
    setTimeout(() => router.push(`${basePath}?f=${to}`), 620);
    setTimeout(() => setWalking(null), 2400);   // in case navigation stalls
  };

  /**
   * A doorway. Every part projects FORWARD out of the wall, never backward:
   * a child at negative Z sits inside the wall, where the wall's own opaque
   * surface hides it. The frame stands proud by JAMB and the slab sits back
   * at the wall plane, which is what reads as recessed.
   */
  const Doorway = (slot: number, style: React.CSSProperties) => {
    const room = at(slot);
    const SLAB = 14;
    // A guest can see the door and be told it is shut. They cannot open it,
    // and the rooms behind it return nothing regardless of what they click.
    // Locked is decided server side by can_read_room, which accounts for a
    // room shared with only some guests.
    const shut = !canEdit && room?.locked === true;
    return (
      <div style={{ position: "absolute", width: DOOR_W, height: DOOR_H, transformStyle: "preserve-3d", ...style }}>
        {/* architrave: four faces standing out of the wall */}
        <div style={{
          position: "absolute", top: 0, left: 0, width: JAMB, height: DOOR_H,
          transformOrigin: "left center", transform: "rotateY(-90deg)",
          background: `linear-gradient(to left, ${C.woodLip}, ${C.woodDark})`,
        }} />
        <div style={{
          position: "absolute", top: 0, right: 0, width: JAMB, height: DOOR_H,
          transformOrigin: "right center", transform: "rotateY(90deg)",
          background: `linear-gradient(to right, ${C.woodLip}, ${C.woodDark})`,
        }} />
        <div style={{
          position: "absolute", top: 0, left: 0, width: DOOR_W, height: JAMB,
          transformOrigin: "center top", transform: "rotateX(90deg)",
          background: `linear-gradient(to bottom, ${C.woodDark}, ${C.wood})`,
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: 0, width: DOOR_W, height: JAMB,
          transformOrigin: "center bottom", transform: "rotateX(-90deg)",
          background: `linear-gradient(to top, ${C.woodLip}, ${C.wood})`,
        }} />

        {/* the slab, sitting at the wall plane so the frame reads as depth */}
        <button
          onClick={() => (shut ? undefined : room ? enter(room) : canEdit && setNaming(slot))}
          style={{
            position: "absolute", inset: 0, transformStyle: "preserve-3d",
            transform: `translateZ(${SLAB}px)`,
            border: "none", cursor: "pointer", padding: 0, background: "transparent",
          }}
        >
          <span style={{
            position: "absolute", inset: 0,
            filter: shut ? "blur(3px) saturate(.55) brightness(.85)" : "none",
            background: room
              ? `linear-gradient(100deg, ${C.woodDark}, ${C.wood} 52%, ${C.woodLip})`
              : "rgba(252,250,246,.72)",
            boxShadow: room
              ? "inset 0 0 0 3px rgba(0,0,0,.22), 0 12px 30px rgba(0,0,0,.35)"
              : "inset 0 0 0 2px rgba(124,115,106,.35)",
          }} />
          <span style={{
            position: "absolute", top: 0, right: 0, width: SLAB, height: DOOR_H,
            transformOrigin: "right center", transform: "rotateY(90deg)",
            background: room ? C.woodDark : "rgba(214,208,196,.9)",
          }} />

          {shut && (
            <span style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 2,
              background: "rgba(20,16,12,.34)",
            }}>
              <span style={{
                background: "rgba(255,253,248,.94)", border: "2px solid #231F1A", borderRadius: 6,
                padding: "8px 12px", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
                color: "#231F1A", textAlign: "center", lineHeight: 1.5, maxWidth: "84%",
              }}>
                Visitors<br />not allowed
              </span>
            </span>
          )}
          {room ? (
            <>
              <span style={{ position: "absolute", inset: "9% 13% 54%", border: "3px solid rgba(0,0,0,.18)" }} />
              <span style={{ position: "absolute", inset: "54% 13% 9%", border: "3px solid rgba(0,0,0,.18)" }} />
              <span style={{ position: "absolute", top: "52%", right: 20, width: 13, height: 13, borderRadius: "50%", background: "#EBD6A6", boxShadow: "0 2px 5px rgba(0,0,0,.45)" }} />
              <span style={{
                position: "absolute", top: "27%", left: "50%", transform: "translateX(-50%)",
                minWidth: "56%", maxWidth: "80%", padding: "9px 12px", borderRadius: 2, textAlign: "center",
                background: "linear-gradient(160deg, #E7CE92, #B8924A 55%, #8A6A32)",
                boxShadow: "0 1px 0 rgba(255,255,255,.35) inset, 0 3px 7px rgba(0,0,0,.45)",
                fontSize: 12.5, letterSpacing: ".14em", textTransform: "uppercase", color: "#2A1F08",
                fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {shut ? "Private" : room.name}
              </span>
            </>
          ) : (
            <span style={{
              position: "absolute", inset: 0, display: "grid", placeItems: "center",
              fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: SOFT,
            }}>
              {canEdit ? "+ room here" : ""}
            </span>
          )}
        </button>

        <div style={{ position: "absolute", bottom: -34, left: 0, width: DOOR_W, textAlign: "center" }}>
          {room ? (canEdit ? (
            <button onClick={(e) => { e.stopPropagation(); setRenaming(room); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: SOFT }}>
              rename
            </button>
          ) : null) : (
            <span style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: C.faint }}>
              {SLOT_LABEL[slot]}
            </span>
          )}
        </div>
      </div>
    );
  };

  /** A flight where every tread has a top, a riser, and a side. */
  const Stair = ({ dir, x, enabled }: { dir: "up" | "down"; x: number; enabled: boolean }) => {
    const STEPS = 7, RISE = 30, RUN = 34, WIDE = 210;
    return (
      <button
        onClick={() => enabled && changeFloor(dir === "up" ? floor + 1 : floor - 1)}
        disabled={!enabled}
        title={enabled ? `Go ${dir}` : dir === "up" ? "Add a room before building upward" : "Ground floor"}
        style={{
          position: "absolute", bottom: 0, left: x, width: WIDE, height: STEPS * RISE + 40,
          background: "none", border: "none", padding: 0,
          cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : .32,
          transformStyle: "preserve-3d",
        }}
      >
        <span style={{
          position: "absolute", top: -34, left: 0, width: "100%", textAlign: "center",
          fontSize: 12, letterSpacing: ".24em", textTransform: "uppercase", color: INK,
        }}>
          {dir === "up" ? "↑ Upstairs" : "↓ Downstairs"}
        </span>

        {Array.from({ length: STEPS }).map((_, i) => {
          // Going up, treads climb away from you. Going down, they fall away.
          const step = dir === "up" ? i : STEPS - 1 - i;
          const y = step * RISE;
          const z = dir === "up" ? (STEPS - step) * RUN : step * RUN;
          return (
            <span key={i} style={{ position: "absolute", bottom: y, left: 0, width: WIDE, height: RISE, transformStyle: "preserve-3d", transform: `translateZ(${z}px)` }}>
              {/* riser, the face you see head on */}
              <span style={{
                position: "absolute", inset: 0,
                background: `linear-gradient(to bottom, ${C.wood}, ${C.woodDark})`,
              }} />
              {/* tread, the surface you would step on */}
              <span style={{
                position: "absolute", top: 0, left: 0, width: WIDE, height: RUN,
                transformOrigin: "center top", transform: "rotateX(-90deg)",
                background: `linear-gradient(to top, ${C.woodLip}, ${C.wood})`,
                boxShadow: "0 2px 5px rgba(0,0,0,.25)",
              }} />
              {/* stringers down each side */}
              <span style={{
                position: "absolute", top: 0, left: 0, width: RUN, height: RISE,
                transformOrigin: "left center", transform: "rotateY(90deg)",
                background: C.woodDark,
              }} />
              <span style={{
                position: "absolute", top: 0, right: 0, width: RUN, height: RISE,
                transformOrigin: "right center", transform: "rotateY(-90deg)",
                background: C.woodDark,
              }} />
            </span>
          );
        })}
      </button>
    );
  };

  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden", fontFamily: "system-ui", background: C.wallDim }}>
      <style>{`
        @keyframes rrRush { 0% { transform: translateZ(-1000px); opacity: 0 } 22% { opacity: 1 } 100% { transform: translateZ(560px); opacity: 1 } }
        @keyframes rrSwing { 0%,38% { transform: rotateY(0) } 100% { transform: rotateY(-90deg) } }
      `}</style>

      <Space
        lift={150}
        zoom={zoom}
        backWall={
          <>
            {Doorway(0, { left: 90, bottom: 70 })}
            {Doorway(1, { right: 90, bottom: 70 })}
            <div style={{ position: "absolute", left: "50%", bottom: 34, width: 500, marginLeft: -250, height: 260, transformStyle: "preserve-3d" }}>
              {/* On the ground floor there is nothing below, so the flight
                  simply is not there rather than being drawn and greyed. */}
              <Stair dir="up" x={canGoDown ? 0 : 145} enabled={canGoUp} />
              {canGoDown && <Stair dir="down" x={280} enabled />}
            </div>
          </>
        }
        leftWall={Doorway(2, { left: D / 2 - DOOR_W / 2, bottom: 60 })}
        rightWall={Doorway(3, { left: D / 2 - DOOR_W / 2, bottom: 60 })}
      />

      <div style={{
        position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
        zIndex: 5, textAlign: "center",
      }}>
        <div style={{ font: "600 18px/1 Georgia, serif", color: INK }}>Floor {floor}</div>
        <div style={{ fontSize: 11, color: SOFT, marginTop: 5 }}>
          {rooms.length} of 4 rooms{topFloor > floor ? ` · ${topFloor} floors built` : ""}
        </div>
      </div>

      {/* create room */}
      {naming !== null && (
        <Overlay onClose={() => setNaming(null)}>
          <form action={createRoom} onSubmit={() => setNaming(null)}>
            <input type="hidden" name="side" value={naming} />
            <input type="hidden" name="floor" value={floor} />
            <Bubble tail="none">
              <BubbleTitle>A new room</BubbleTitle>
              <BubbleHint>{SLOT_LABEL[naming]} of floor {floor}. You can rename it any time.</BubbleHint>
              <input name="name" autoFocus placeholder="What's in here?" style={bubbleInput} />
              <BubbleButtons onCancel={() => setNaming(null)} submitLabel="Open the door" />
            </Bubble>
          </form>
        </Overlay>
      )}

      {/* rename room */}
      {renaming && (
        <Overlay onClose={() => setRenaming(null)}>
          <form action={renameRoom} onSubmit={() => setRenaming(null)}>
            <input type="hidden" name="roomId" value={renaming.id} />
            <Bubble tail="none">
              <BubbleTitle>Rename the room</BubbleTitle>
              <BubbleHint>Currently called {renaming.name}.</BubbleHint>
              <input name="name" autoFocus defaultValue={renaming.name} style={bubbleInput} />
              <BubbleButtons onCancel={() => setRenaming(null)} submitLabel="Save" />
            </Bubble>
          </form>
        </Overlay>
      )}

      {walking && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#15120E", display: "grid", placeItems: "center", perspective: 900 }}>
          <div style={{ width: 220, height: 380, position: "relative", animation: "rrRush 720ms cubic-bezier(.42,0,.9,.7) forwards" }}>
            <div style={{ position: "absolute", inset: -12, background: `linear-gradient(160deg, ${C.wood}, ${C.woodDark})` }} />
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 70% at 50% 45%, rgba(255,248,232,.92), rgba(255,248,232,.12))" }} />
            <div style={{
              position: "absolute", inset: 0, transformOrigin: "left center",
              background: `linear-gradient(100deg, ${C.woodDark}, ${C.wood})`,
              animation: "rrSwing 720ms cubic-bezier(.3,0,.2,1) forwards",
            }}>
              <div style={{ position: "absolute", inset: "8% 12%", border: "2px solid rgba(0,0,0,.24)" }} />
            </div>
          </div>
          <div style={{ position: "absolute", bottom: "15%", color: "rgba(255,248,232,.85)", fontSize: 11, letterSpacing: ".3em", textTransform: "uppercase" }}>
            {walking.label}
          </div>
        </div>
      )}
    </main>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 30, display: "grid", placeItems: "center",
        background: "rgba(35,31,26,.28)", backdropFilter: "blur(3px)",
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
