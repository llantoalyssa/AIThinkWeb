"use client";

// ============================================================
// AnnotatableRichEditor — a TipTap editor wrapped in a
// `data-annotate` container for the SUBMITTED-TAF student view.
//
// Why this exists:
//  • The AnnotationLayer's selection→comment engine walks up from a
//    text selection looking for a `[data-annotate]` ancestor. Wrapping
//    the student's editable field in `data-annotate` lets the student
//    comment on their own submitted TAF text.
//  • Approvers get PERSISTENT amber highlighting in their read-only
//    view (AnnotatedSection). In the student's LIVE editor you cannot
//    safely inject persistent <mark> tags (TipTap owns the doc model).
//    So instead we offer a TRANSIENT flash: when the user clicks an
//    annotated comment, we briefly pulse the paragraph that contains
//    the matched snippet, then fade. It never fights their editing.
//
// Flash technique: we overlay a decorative amber box on the paragraph's
// bounding rectangle instead of adding a CSS class to the TipTap node —
// TipTap re-renders its DOM on transactions and can strip/never apply
// classes, so a DOM-attached animation is unreliable. A fixed-position
// overlay (appended to body) animates on top and is removed after.
// ============================================================

import { useEffect, useRef } from "react";
import RichTextEditor from "@/components/rich-text-editor";
import type { AnnotationFieldKey } from "@/server/actions/submission-annotations";

export default function AnnotatableRichEditor({
  fieldKey,
  value,
  onChange,
}: {
  fieldKey: AnnotationFieldKey;
  value: string;
  onChange: (html: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleJump(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { fieldKey?: AnnotationFieldKey; snippet?: string }
        | undefined;
      if (!detail || detail.fieldKey !== fieldKey) return;
      const snippet = detail.snippet;
      const container = containerRef.current;
      if (!container || !snippet) return;

      const editorDom = container.querySelector<HTMLElement>(
        ".rich-text-content",
      );
      if (!editorDom) return;

      // Find the paragraph/block whose text contains the snippet.
      // Matching is tolerant: the stored snippet comes from a DOM selection, so
      // it can differ from the editor's textContent in whitespace or case
      // (a selection spanning a soft line break carries a newline). A strict
      // match used to fail and fall back to the field's first block, which
      // reads as "it didn't jump to my comment".
      const blocks = Array.from(
        editorDom.querySelectorAll<HTMLElement>("p, h1, h2, h3, li, blockquote"),
      );
      const want = snippet.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      const normalized = (el: HTMLElement) =>
        (el.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

      const strictMatch = blocks.find((b) => (b.textContent || "").includes(snippet));
      const looseMatch =
        strictMatch ||
        blocks.find((b) => want.length > 0 && normalized(b).includes(want)) ||
        blocks.find((b) => {
          // The snippet may be longer than the highlighted run (or shorter).
          const have = normalized(b);
          if (want.length < 12 || have.length < 12) return false;
          return want.startsWith(have.slice(0, 12)) || have.startsWith(want.slice(0, 12));
        });

      const target = looseMatch || blocks[0];
      if (!target) return;

      // Nothing matched: the passage the comment was anchored to is gone (the
      // student edited it). Say so instead of silently jumping to the top of
      // the field.
      // The editor's full text may still hold the anchor even when no single
      // block matched (a snippet spanning two paragraphs, say). Only report a
      // real miss when it is gone from the whole field.
      const fieldText = normalized(editorDom);
      const anchorStillPresent =
        want.length > 0 && (fieldText.includes(want) || want.includes(fieldText));
      if (!looseMatch && want.length > 0 && !anchorStillPresent) {
        window.dispatchEvent(
          new CustomEvent("annotation-jump-miss", {
            detail: { fieldKey, snippet },
          }),
        );
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      flashOverlay(target);
    }
    window.addEventListener("annotation-jump", handleJump as EventListener);
    return () =>
      window.removeEventListener(
        "annotation-jump",
        handleJump as EventListener,
      );
  }, [fieldKey]);

  return (
    <div ref={containerRef} data-annotate={fieldKey}>
      <RichTextEditor value={value} onChange={onChange} />
    </div>
  );
}

// ── Transient amber flash over a paragraph's bounding box ─────────

function flashOverlay(target: HTMLElement) {
  // Position may shift slightly after scrollIntoView settles — re-measure
  // after a short delay for an accurate box.
  window.setTimeout(() => {
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = `${rect.left - 4}px`;
    overlay.style.top = `${rect.top - 4}px`;
    overlay.style.width = `${rect.width + 8}px`;
    overlay.style.height = `${rect.height + 8}px`;
    overlay.style.borderRadius = "6px";
    overlay.style.background = "rgba(253, 230, 138, 0.55)";
    overlay.style.boxShadow = "0 0 0 2px rgba(245, 158, 11, 0.8), 0 0 18px rgba(245, 158, 11, 0.6)";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "9999";
    overlay.style.transition =
      "opacity 450ms ease, transform 450ms ease";
    overlay.style.animation = "annotTransitionPulse 0.7s ease-in-out 2";
    // Restore position height to the original rect at animation end.
    document.body.appendChild(overlay);

    const remove = () => overlay.remove();
    // Let the double-pulse finish (~1.4s) then fade out.
    window.setTimeout(() => {
      overlay.style.opacity = "0";
      window.setTimeout(remove, 450);
    }, 1400);
  }, 60);
}