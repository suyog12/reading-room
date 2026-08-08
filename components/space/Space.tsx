"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * A real room box: five planes in CSS 3D with the camera standing inside it.
 * Not a flat picture of a room — the walls actually recede, and anything
 * placed on a wall inherits that wall's perspective for free.
 *
 * Axis notes, because these are easy to get backwards:
 *   rotateX(90deg)  maps local +z to world up   -> floor sits at translateZ(-H/2)
 *   rotateY(90deg)  maps local +z to world +x   -> left wall at translateZ(-W/2)
 * Children of a wall are plain 2D inside that plane. On the back wall,
 * local +z points at the camera, so translateZ() pulls objects into the room.
 */

export const PERSPECTIVE = 2600;

export const W = 1500;  // room width
export const H = 620;   // default wall height, fits a window without overflow
export const D = 1500;  // room depth; square so every wall reads the same

/**
 * How far the camera stands from the wall it is facing. You are INSIDE the
 * room, near one wall, looking at the opposite one.
 *
 * The wall behind you is at positive Z, where CSS magnifies it until it
 * covers the screen — a blank page. So it is not drawn at all. Which wall
 * that is depends on `turn`, and it swaps as you rotate.
 */
export const STAND = 300;

/** How much the perspective divide shrinks the back wall on screen. */
export const PROJ = PERSPECTIVE / (PERSPECTIVE + STAND);

const plane = (w: number, h: number, transform: string): CSSProperties => ({
  position: "absolute",
  left: -w / 2,
  top: -h / 2,
  width: w,
  height: h,
  transformStyle: "preserve-3d",
  transform,
});

export const C = {
  wallLit: "#F4F1EB",
  wallMid: "#E9E4DA",
  wallDim: "#D9D2C6",
  floor: "#C99C64",
  floorSeam: "#AF8449",
  ceiling: "#FBFAF7",
  ink: "#231F1A",
  soft: "#7C736A",
  faint: "#A79E92",
  wood: "#B08A54",
  woodDark: "#7A5C34",
  woodLip: "#D2B183",
  accent: "#2F5E4E",
};

export default function Space({
  children,
  backWall,
  leftWall,
  rightWall,
  lift = 120,
  cameraY = 0,
  height = H,
  turn = 0,
  zoom = 1,
  frontWall,
}: {
  children?: ReactNode;
  backWall?: ReactNode;
  leftWall?: ReactNode;
  rightWall?: ReactNode;
  /** kept for compatibility; camera distance is fixed by STAND */
  lift?: number;
  /**
   * Vertical camera pan in px. Positive looks down, negative looks up.
   * The vanishing point moves with it, which is what makes it read as
   * tilting your head rather than sliding a picture.
   */
  cameraY?: number;
  /** Taller than the viewport means there is somewhere to look. */
  height?: number;
  /** Which wall you face: 0 back, 1 right, 2 front, 3 left. */
  turn?: number;
  /** Scales the whole scene so a wide room still fits a narrow window. */
  zoom?: number;
  frontWall?: ReactNode;
}) {
  const wallH = height;
  // You face wall `turn`; the one behind you is two around, and drawing it
  // would fill the screen.
  const hidden = (turn + 2) % 4;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        perspective: PERSPECTIVE,
        perspectiveOrigin: `50% ${44 - cameraY * 0.035}%`,
        background: C.wallDim,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          transform: `scale(${zoom}) translateZ(${D / 2 - STAND}px) translateY(${cameraY}px) rotateY(${-turn * 90}deg)`,
          transition: "transform 760ms cubic-bezier(.4,.02,.2,1)",
        }}
      >
        {/* floor */}
        <div style={{
          ...plane(W, D, `rotateX(90deg) translateZ(${-wallH / 2}px)`),
          background: `repeating-linear-gradient(90deg, ${C.floor} 0 104px, ${C.floorSeam} 104px 107px)`,
          boxShadow: "inset 0 0 120px rgba(0,0,0,.28)",
        }} />

        {/* ceiling */}
        <div style={{
          ...plane(W, D, `rotateX(-90deg) translateZ(${-wallH / 2}px)`),
          background: `linear-gradient(to bottom, ${C.ceiling}, #EDE9E1)`,
        }} />

        {/* left wall */}
        {hidden !== 3 && (
          <div style={{
            ...plane(D, wallH, `rotateY(90deg) translateZ(${-W / 2}px)`),
            background: `linear-gradient(to right, ${C.wallDim}, ${C.wallMid})`,
          }}>
            {leftWall}
          </div>
        )}

        {/* right wall */}
        {hidden !== 1 && (
          <div style={{
            ...plane(D, wallH, `rotateY(-90deg) translateZ(${-W / 2}px)`),
            background: `linear-gradient(to left, ${C.wallDim}, ${C.wallMid})`,
          }}>
            {rightWall}
          </div>
        )}

        {/* back wall */}
        {hidden !== 0 && (
        <div style={{
          ...plane(W, wallH, `translateZ(${-D / 2}px)`),
          background: `linear-gradient(to bottom, ${C.wallLit}, ${C.wallMid})`,
        }}>
          {/* light pooling down the back wall */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(70% 55% at 50% 8%, rgba(255,246,225,.55), rgba(0,0,0,0) 72%)",
          }} />
          {backWall}
        </div>
        )}

        {/* front wall: only drawn when you have turned to face it */}
        {hidden !== 2 && (
          <div style={{
            ...plane(W, wallH, `translateZ(${D / 2}px) rotateY(180deg)`),
            background: `linear-gradient(to bottom, ${C.wallMid}, ${C.wallDim})`,
          }}>
            {frontWall}
          </div>
        )}

        {children}
      </div>

      {/* corner darkening, sells the enclosure */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        boxShadow: "inset 0 0 260px 70px rgba(40,32,22,.34)",
      }} />
    </div>
  );
}
