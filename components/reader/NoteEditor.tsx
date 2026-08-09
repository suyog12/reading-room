"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const FONTS = [
  { id: "lora", label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "sans", label: "Sans", stack: "system-ui, sans-serif" },
  { id: "mono", label: "Mono", stack: "ui-monospace, 'Courier New', monospace" },
];

/**
 * Autosaves the TipTap document to notes.doc. Debounced, because a write per
 * keystroke would hammer the database and fight the page turn.
 */
export default function NoteEditor({
  pageId, doc, editable, font, size,
}: {
  pageId: string;
  doc: any;
  editable: boolean;
  font: string;
  size: number;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(true);
  const [empty, setEmpty] = useState(true);
  const stack = FONTS.find((f) => f.id === font)?.stack ?? FONTS[0].stack;

  const editor = useEditor({
    extensions: [StarterKit],
    content: doc ?? { type: "doc", content: [] },
    editable,
    // Required under Next SSR, or the first client render disagrees with the
    // server HTML and React tears the tree down.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        style: `outline:none;height:100%;min-height:100%;font:400 ${size}px/1.75 ${stack};color:#231F1A;`,
      },
    },
    onCreate({ editor }) {
      setEmpty(editor.isEmpty);
    },
    onUpdate({ editor }) {
      setEmpty(editor.isEmpty);
      if (!editable) return;
      setSaved(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const supabase = createClient();
        await supabase.from("notes").update({ doc: editor.getJSON() }).eq("page_id", pageId);
        setSaved(true);
      }, 800);
    },
  }, [pageId]);

  useEffect(() => { editor?.setEditable(editable); }, [editable, editor]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!editor) return null;


  return (
    /*
      The click handler and the padding both live on the outermost element.
      When the padding sat on a parent, the margins of the page looked
      writable and did nothing — the click never reached the editor.
    */
    <div
      onClick={() => editable && editor.commands.focus("end")}
      style={{
        height: "100%", display: "flex", flexDirection: "column",
        position: "relative", padding: "34px 30px 22px 36px",
        cursor: editable ? "text" : "default",
      }}
    >
      <style>{`
        .rr-note, .rr-note .ProseMirror { height: 100%; }
        .rr-note .ProseMirror { min-height: 100%; }
      `}</style>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
        {/*
          A blank page should say what it is for. This sits behind the editor
          rather than inside the document, so it never becomes content and
          never has to be deleted before writing.
        */}
        {empty && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {editable ? (
              <>
                <div style={{ font: `600 ${size + 4}px/1.4 Georgia, serif`, color: "#B9AF9F" }}>
                  Click here to write
                </div>
                <div style={{ fontSize: 12.5, color: "#C6BDAD", marginTop: 8, lineHeight: 1.6 }}>
                  What was happening, who was there, why you kept this.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "#C6BDAD" }}>Nothing written here.</div>
            )}
          </div>
        )}

        <EditorContent editor={editor} style={{ height: "100%" }} className="rr-note" />
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(35,31,26,.08)",
      }}>
        <span style={{ fontSize: 9, letterSpacing: ".18em", color: "#B9AF9F" }}>NOTES</span>
        {editable && (
          <span style={{ fontSize: 9, letterSpacing: ".16em", color: saved ? "#C6BDAD" : "#8A8375" }}>
            {saved ? "SAVED" : "SAVING"}
          </span>
        )}
      </div>
    </div>
  );
}
