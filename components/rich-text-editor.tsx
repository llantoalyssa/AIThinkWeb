"use client";

// ============================================================
// RichTextEditor — TipTap-based WYSIWYG editor for TAF fields
// Toolbar: bold, italic, underline, strike, headings (H2/H3),
// bullet/ordered lists, blockquote, code, link, undo/redo.
// Supports read-only (locked) mode via `readOnly` prop.
// ============================================================

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link as LinkIcon,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: string;
  /** Extra classes on the wrapper (e.g. to dim a read-only editor). */
  className?: string;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors cursor-pointer",
        "hover:bg-gray-100 hover:text-gray-800",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        active && "bg-[#8B1A1A]/10 text-[#8B1A1A]"
      )}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = "Write something...",
  minHeight = "120px",
  /** Extra classes on the wrapper (e.g. to dim a read-only editor). */
  className,
}: Props) {
  // Tracks last value we pushed into the editor externally.
  const lastPushed = useRef<string>(value || "");
  // True until the editor has been focused or has emitted real content. The
  // transaction TipTap dispatches when the editor is CREATED arrives while the
  // editor is still pristine and reports an EMPTY doc — that emission must not
  // reach `onChange`: on a draft-restore flow the editor mounts empty (the
  // draft lands one commit later) and forwarding it blanked every field the
  // restore had just filled, then the autosave persisted the blanks.
  // A genuine clear by the user always happens in a FOCUSED editor, so
  // `onFocus` clears pristine and later empty emissions pass through.
  const pristineRef = useRef(true);

  const editor = useEditor({
    // Next.js SSR: must be false to avoid hydration mismatch errors
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: value || "",
    editable: !readOnly,
    editorProps: {
      attributes: {
        class:
          "rich-text-content max-w-none focus:outline-none min-h-[120px] px-3 py-2 text-sm leading-relaxed text-[#333]",
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = e.isEmpty ? "" : e.getHTML();
      // Drop the creation-time empty emission (see pristineRef above).
      if (!html && pristineRef.current) {
        lastPushed.current = html;
        return;
      }
      pristineRef.current = false;
      lastPushed.current = html;
      onChange(html);
    },
    onFocus: () => {
      // Once the user interacts, empty emissions are genuine clears.
      pristineRef.current = false;
    },
  });

  // Apply readOnly changes (toggle editable without losing content)
  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable === readOnly) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Sync external `value` changes (e.g. TAF loaded async, or the AI
  // enhancement write-back after analyze/re-analyze) into the editor.
  // The lastPushed comparison prevents re-setting the same value (which
  // would clobber the user's cursor) — we intentionally do NOT gate this
  // on "user has typed", because a genuine external update (enhancement /
  // load) must still reach the editor even after edits.
  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    if (incoming === lastPushed.current) return;
    editor.commands.setContent(incoming, { emitUpdate: false });
    lastPushed.current = incoming;
  }, [value, editor]);

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-[#8B1A1A]/40 focus-within:ring-2 focus-within:ring-[#8B1A1A]/10",
        readOnly && "bg-gray-50/50",
        className
      )}
    >
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 px-2 py-1.5">
          <ToolbarButton
            title="Bold (Ctrl+B)"
            active={editor?.isActive("bold")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Italic (Ctrl+I)"
            active={editor?.isActive("italic")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Underline (Ctrl+U)"
            active={editor?.isActive("underline")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Strikethrough"
            active={editor?.isActive("strike")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-gray-200" />

          <ToolbarButton
            title="Heading 2"
            active={editor?.isActive("heading", { level: 2 })}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Heading 3"
            active={editor?.isActive("heading", { level: 3 })}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-gray-200" />

          <ToolbarButton
            title="Bullet list"
            active={editor?.isActive("bulletList")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Numbered list"
            active={editor?.isActive("orderedList")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Blockquote"
            active={editor?.isActive("blockquote")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Inline code"
            active={editor?.isActive("code")}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <Code className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Add link"
            active={editor?.isActive("link")}
            disabled={!editor}
            onClick={() => {
              if (!editor) return;
              const prev = editor.getAttributes("link").href as string | undefined;
              const url = window.prompt("Enter URL (https://...)", prev || "https://");
              if (url === null) return;
              if (url === "") {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
              } else {
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: url })
                  .run();
              }
            }}
          >
            <LinkIcon className="h-4 w-4" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-gray-200" />

          <ToolbarButton
            title="Undo"
            disabled={!editor}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            title="Redo"
            disabled={!editor}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      <div style={{ minHeight }} className="relative">
        <EditorContent editor={editor} />
        {editor && editor.isEmpty && !readOnly && (
          <div className="pointer-events-none absolute top-2 left-3 text-sm text-gray-400">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper: extract plain text from HTML (for validation / previews) ──

export function htmlToText(html: string): string {
  if (!html) return "";
  if (typeof document !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }
  // Server-side fallback: crude tag strip
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
