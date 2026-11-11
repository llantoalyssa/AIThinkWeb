"use client";

// ============================================================
// AnnotatedSection — renders one TAF section's HTML with
// snippet highlights for the comments anchored to it, wrapped in
// a `data-annotate` container so the AnnotationLayer can detect
// text selections and open the "Add comment" popover.
//
// Highlights are done at the plain-text level: we escape the
// section's HTML for display only when it isn't real HTML. For
// real rich-text HTML we do a safe literal snippet replace so
// highlighted snippets render with an amber underline/pill.
// ============================================================

import { useEffect, useRef, useState } from "react";
import RichTextView from "@/components/rich-text-view";
import { looksLikeHtml } from "@/lib/html";
import { useAnnotations } from "@/components/annotation-layer";
import type { Annotation, AnnotationFieldKey } from "@/server/actions/submission-annotations";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize text for tolerant comparison (whitespace + case). */
function normalizeText(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function markOf(text: string): string {
  return `<mark class="annotation-hl" title="Commented">${text}</mark>`;
}

/**
 * Replace literal hints of a snippet in (already-sanitized) HTML.
 *
 * Two passes:
 *  1. exact literal replace (fast path),
 *  2. whitespace-tolerant replace — the stored snippet is captured from a DOM
 *     selection, so it routinely differs from the raw HTML in whitespace
 *     (a selection spanning a line break keeps a "\n", the HTML has "\n    ").
 *     Without this fallback NO <mark> was produced for those threads, and
 *     clicking the comment could not scroll to the highlighted text (it fell
 *     back to merely outlining the section).
 */
function highlightHtml(html: string, snippets: string[]): string {
  let out = html;
  for (const s of snippets) {
    if (!s) continue;
    const escaped = escapeHtml(s);

    if (out.includes(escaped)) {
      out = out.split(escaped).join(markOf(escaped));
      continue;
    }

    // Whitespace-tolerant attempt: every whitespace run in the snippet may be
    // any whitespace run in the HTML.
    const tokens = escaped.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const pattern = tokens.map(escapeRe).join("\\s+");
    try {
      const re = new RegExp(pattern, "g");
      if (re.test(out)) {
        out = out.replace(new RegExp(pattern, "g"), (m) => markOf(m));
      }
    } catch {
      // Malformed pattern — skip this snippet rather than break rendering.
    }
  }
  return out;
}

export default function AnnotatedSection({
  fieldKey,
  html,
  fallback = "—",
}: {
  fieldKey: AnnotationFieldKey;
  html: string | null | undefined;
  fallback?: string;
}) {
  const { forField } = useAnnotations();
  const threads = forField(fieldKey);
  const [flash, setFlash] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Flash the section briefly when the user jumps to it (via .focus ring
  // is handled in the layer; here we just re-render when threads change).
  useEffect(() => {
    if (threads.length === 0) return;
    const t = setTimeout(() => setFlash(true), 0);
    const timer = setTimeout(() => setFlash(false), 800);
    return () => {
      clearTimeout(t);
      clearTimeout(timer);
    };
  }, [threads.length]);

  // When the annotation-jump event names THIS field, scroll into view and
  // pulse the specific <mark> whose text matches the snippet. When the
  // event carries no snippet (section-level jump), outline the section.
  useEffect(() => {
    function handleJump(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { fieldKey?: AnnotationFieldKey; snippet?: string; handled?: boolean }
        | undefined;
      if (!detail || detail.fieldKey !== fieldKey) return;
      const el = rootRef.current;
      if (!el) return;
      const snippet = detail.snippet;
      if (snippet) {
        // Find the <mark> whose text matches the snippet and flash it.
        // Matching is deliberately tolerant: the stored snippet comes from a
        // DOM selection, so it can differ from the rendered text in whitespace
        // or case. A strict match used to miss and silently degrade to the
        // section outline (which reads as "it didn't jump to my comment").
        const marks = Array.from(el.querySelectorAll<HTMLElement>("mark.annotation-hl"));
        const want = normalizeText(snippet).toLowerCase();
        const target =
          marks.find((m) => (m.textContent || "").includes(snippet)) ||
          marks.find(
            (m) =>
              want.length > 0 &&
              normalizeText(m.textContent || "").toLowerCase().includes(want),
          ) ||
          marks.find((m) => {
            // The snippet may be longer than the highlighted run (or shorter).
            const have = normalizeText(m.textContent || "").toLowerCase();
            if (want.length < 12 || have.length < 12) return false;
            return (
              have.startsWith(want.slice(0, 12)) ||
              want.startsWith(have.slice(0, 12))
            );
          }) ||
          // Any highlight is better than none: a SHORT anchor (a title of a few
          // words) can never satisfy the 12-character loose match above, and
          // requiring exactly one mark meant a perfectly intact short anchor
          // reported "the text has changed". The section-level outline below is
          // still the fallback when there is genuinely no highlight at all.
          marks[0];
        if (target) {
          // Several components listen for the same event (the read-only section
          // here, the live editor, the title input). Whoever finds the anchor
          // marks the SHARED detail object, so nobody else can report a miss for
          // a jump that visibly worked.
          detail.handled = true;
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.classList.add("annotation-pulse");
          setTimeout(() => target.classList.remove("annotation-pulse"), 2200);
          return;
        }

        // The highlighted text isn't in this section any more (the student
        // edited that passage after the comment was written). Tell the panel so
        // it can explain the jump instead of silently doing nothing, then fall
        // through to the section-level scroll below.
        // Only a REAL miss. Two things can keep the highlight from rendering
        // even though the anchor is intact (a field rendered as plain text, a
        // snippet that only matches across a normalisation boundary), so before
        // claiming "the text has changed" check the section's own text.
        const sectionText = normalizeText(el.textContent || "").toLowerCase();
        const snippetText = normalizeText(snippet).toLowerCase();
        const anchorStillPresent =
          snippetText.length > 0 && sectionText.includes(snippetText);

        if (!anchorStillPresent) {
          // Deferred: another listener may still resolve this jump this tick.
          const sharedDetail = detail;
          setTimeout(() => {
            if (sharedDetail.handled) return;
            window.dispatchEvent(
              new CustomEvent("annotation-jump-miss", {
                detail: { fieldKey, snippet },
              }),
            );
          }, 0);
        }
      }
      // Fallback: section-level outline
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #f59e0b";
      setTimeout(() => {
        el.style.outline = "";
      }, 1800);
    }
    window.addEventListener("annotation-jump", handleJump as EventListener);
    return () =>
      window.removeEventListener("annotation-jump", handleJump as EventListener);
  }, [fieldKey]);

  const snippets = threads
    .filter((a: Annotation) => !!a.textSnippet && !a.resolved)
    .map((a: Annotation) => a.textSnippet);

  // Badge counts only OPEN (unresolved) threads — resolving a thread
  // removes its badge and its highlight.
  const openCount = threads.filter((a: Annotation) => !a.resolved).length;

  return (
    <div
      data-annotate={fieldKey}
      ref={rootRef}
      className={`relative transition-all ${flash ? "bg-amber-50" : ""}`}
    >
      {openCount > 0 && (
        <span
          className="absolute -top-2 right-3 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white shadow"
          title={`${openCount} open comment${openCount === 1 ? "" : "s"}`}
        >
          {openCount}
        </span>
      )}

      {looksLikeHtml(html) ? (
        <div
          className="rich-text-content max-w-none text-sm leading-relaxed text-[#333]"
          dangerouslySetInnerHTML={{ __html: highlightHtml(html || "", snippets) }}
        />
      ) : (
        <RichTextView html={html} fallback={fallback} className="max-h-60 overflow-y-auto" />
      )}

      <style>
        {`
          .annotation-hl {
            background: #fde68a;
            border-bottom: 2px solid #f59e0b;
            border-radius: 3px;
            padding: 2px 3px;
            font-weight: 600;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
            cursor: default;
            outline: 1px solid rgba(245,158,11,0.35);
          }
          .annotation-hl:hover {
            background: #fcd34d;
            outline: 2px solid rgba(245,158,11,0.8);
          }
          .annotation-pulse {
            animation: annotationPulse 0.8s ease-in-out 2;
          }
          @keyframes annotationPulse {
            0%, 100% {
              background: #fde68a;
              outline: 2px solid rgba(245,158,11,0.5);
              transform: scale(1);
            }
            50% {
              background: #fbbf24;
              outline: 3px solid #f59e0b;
              transform: scale(1.04);
            }
          }
        `}
      </style>
    </div>
  );
}