"use client";

import type { ReactNode, CSSProperties } from "react";

export const INK = "#231F1A", PAPER = "#FFFDF8", WASH = "#F3EFE7";
export const SOFT = "#7C736A", GREEN = "#2F5E4E", EDGE = "#E4DED2";

/** The speech-bubble shell shared by every popover in the app. */
export function Bubble({
  children, tail = "bottom", width = 340,
}: { children: ReactNode; tail?: "bottom" | "top" | "none"; width?: number }) {
  return (
    <div style={{ position: "relative", width }}>
      <div style={{
        background: PAPER, border: `2px solid ${INK}`, borderRadius: 24,
        padding: "20px 20px 18px", boxShadow: "10px 10px 0 rgba(35,31,26,.13)",
      }}>
        {children}
      </div>
      {tail !== "none" && (
        <div style={{
          position: "absolute", left: 42, width: 22, height: 22, background: PAPER,
          ...(tail === "bottom"
            ? { bottom: -12, borderRight: `2px solid ${INK}`, borderBottom: `2px solid ${INK}` }
            : { top: -12, borderLeft: `2px solid ${INK}`, borderTop: `2px solid ${INK}` }),
          transform: "rotate(45deg)", borderRadius: "0 0 4px 0",
        }} />
      )}
    </div>
  );
}

export const BubbleTitle = ({ children }: { children: ReactNode }) => (
  <div style={{ font: "600 17px/1.2 Georgia, serif", color: INK, marginBottom: 4 }}>{children}</div>
);

export const BubbleHint = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 12, color: SOFT, marginBottom: 14, lineHeight: 1.5 }}>{children}</div>
);

export const bubbleInput: CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 13,
  border: `2px solid ${EDGE}`, background: WASH, color: INK,
  font: "600 15px/1.2 Georgia, serif", outline: "none",
};

export const bubbleSelect: CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 13, marginTop: 9,
  border: `2px solid ${EDGE}`, background: WASH, color: INK, font: "400 14px system-ui",
};

export function BubbleButtons({
  onCancel, submitLabel, disabled,
}: { onCancel: () => void; submitLabel: string; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
      <button type="button" onClick={onCancel} style={{
        padding: "9px 15px", borderRadius: 99, border: `2px solid ${EDGE}`,
        background: "transparent", color: SOFT, fontSize: 13, cursor: "pointer",
      }}>Cancel</button>
      <div style={{ flex: 1 }} />
      <button disabled={disabled} style={{
        padding: "10px 20px", borderRadius: 99, border: "none",
        background: disabled ? "#D8D1C5" : INK, color: PAPER,
        fontSize: 13.5, fontWeight: 600, cursor: disabled ? "default" : "pointer",
        boxShadow: disabled ? "none" : "0 4px 0 rgba(35,31,26,.25)",
      }}>{submitLabel}</button>
    </div>
  );
}
