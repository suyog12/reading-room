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
 * Autosaves the TipTap document to notes.doc. Debounced, because a keystroke
 * per write would hammer the database and fight the page turn animation.
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
        style: `outline:none;min-height:100%;font:400 ${size}px/1.7 ${stack};color:#231F1A;`,
      },
    },
    onUpdate({ editor }) {
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

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!editor) return null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflow: "auto" }}>
        <EditorContent editor={editor} style={{ height: "100%" }} />
      </div>
      {editable && (
        <div style={{ fontSize: 9, letterSpacing: ".16em", color: saved ? "#B3AA9E" : "#7C736A", marginTop: 8 }}>
          {saved ? "SAVED" : "SAVING"}
        </div>
      )}
    </div>
  );
}
