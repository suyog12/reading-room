"use client";

import type { ReactNode } from "react";

/**
 * You face exactly one wall. Turning swings the next one in from the side.
 *
 * Everything on the wall is anchored to the FLOOR LINE: children are placed
 * with `bottom` measured up from it, so a bookcase stands on the floor the
 * same way at any window size. The camera is a plain pixel shift applied
 * before the scale, so the caller can do its maths in screen space.
 */

export const WALL_W = 1500;
export const FLOOR_SHARE = 0.16;   // how much of the window the floor takes
export const CEIL_SHARE = 0.08;

export const C = {
  wallTop: "#F7F4ED",
  wallBottom: "#E6E0D4",
  wallEdge: "#D2CABB",
  ceiling: "#FCFBF8",
  floor: "#C99C64",
  floorSeam: "#AF8449",
  ink: "#231F1A",
  soft: "#7C736A",
  faint: "#A79E92",
  wood: "#B08A54",
  woodDark: "#7A5C34",
  woodLip: "#D2B183",
  accent: "#2F5E4E",
};

export default function RoomStage({
  children, zoom = 1, shiftY = 0, turn = 0, dir = 1,
}: {
  children: ReactNode;
  zoom?: number;
  /** screen pixels to move the wall by; positive moves it down */
  shiftY?: number;
  turn?: number;
  dir?: number;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: C.wallBottom }}>
      <style>{`
        @keyframes rrTurnIn {
          from { transform: perspective(1600px) rotateY(var(--rot)) translateX(var(--tx)); opacity: 0 }
          to   { transform: perspective(1600px) rotateY(0deg) translateX(0); opacity: 1 }
        }
      `}</style>

      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: `${CEIL_SHARE * 100}%`,
        background: `linear-gradient(to bottom, ${C.ceiling}, ${C.wallTop})`,
        clipPath: "polygon(0 0, 100% 0, 94% 100%, 6% 100%)",
      }} />

      <div style={{
        position: "absolute", top: `${CEIL_SHARE * 100}%`, bottom: `${FLOOR_SHARE * 100}%`, left: 0, right: 0,
        background: `linear-gradient(to bottom, ${C.wallTop}, ${C.wallBottom})`,
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(70% 58% at 50% 2%, rgba(255,247,228,.55), rgba(0,0,0,0) 76%)",
        }} />
      </div>

      <div style={{
        position: "absolute", top: `${CEIL_SHARE * 100}%`, bottom: `${FLOOR_SHARE * 100}%`, left: 0, width: "6%",
        background: `linear-gradient(to right, ${C.wallEdge}, ${C.wallBottom})`,
        clipPath: "polygon(0 -14%, 100% 0, 100% 100%, 0 114%)",
      }} />
      <div style={{
        position: "absolute", top: `${CEIL_SHARE * 100}%`, bottom: `${FLOOR_SHARE * 100}%`, right: 0, width: "6%",
        background: `linear-gradient(to left, ${C.wallEdge}, ${C.wallBottom})`,
        clipPath: "polygon(100% -14%, 0 0, 0 100%, 100% 114%)",
      }} />

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: `${FLOOR_SHARE * 100}%`,
        background: `repeating-linear-gradient(90deg, ${C.floor} 0 118px, ${C.floorSeam} 118px 121px)`,
        clipPath: "polygon(6% 0, 94% 0, 100% 100%, 0 100%)",
        boxShadow: "inset 0 14px 26px rgba(0,0,0,.2)",
      }} />
      <div style={{
        position: "absolute", bottom: `${FLOOR_SHARE * 100}%`, left: "6%", right: "6%", height: 5,
        background: `linear-gradient(to bottom, ${C.wallEdge}, ${C.woodDark})`,
      }} />

      {/* the wall's contents, swung in on each turn */}
      <div
        key={turn}
        style={{
          position: "absolute", inset: 0,
          animation: "rrTurnIn 600ms cubic-bezier(.3,.02,.2,1) both",
          ["--rot" as any]: `${dir * 40}deg`,
          ["--tx" as any]: `${dir * 24}%`,
        }}
      >
        {/* zero-height rail sitting exactly on the floor line */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: `${FLOOR_SHARE * 100}%`, height: 0 }}>
          <div style={{
            position: "absolute", left: "50%", bottom: 0, width: WALL_W, marginLeft: -WALL_W / 2,
            transform: `translateY(${shiftY}px) scale(${zoom})`,
            transformOrigin: "50% 100%",
            transition: "transform 600ms cubic-bezier(.3,.02,.2,1)",
            transformStyle: "preserve-3d",
          }}>
            {children}
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        boxShadow: "inset 0 0 200px 56px rgba(45,36,25,.18)",
      }} />
    </div>
  );
}
