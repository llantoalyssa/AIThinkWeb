"use client";
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
function normalizeText(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function markOf(text: string): string {
  return `<mark class="annotation-hl" title="Commented">${text}</mark>`;
}
function highlightHtml(html: string, snippets: string[]): string {
  let out = html;
  for (const s of snippets) {
    if (!s) continue;
    const escaped = escapeHtml(s);

    if (out.includes(escaped)) {
      out = out.split(escaped).join(markOf(escaped));
      continue;
    }
    const tokens = escaped.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const pattern = tokens.map(escapeRe).join("\\s+");
    try {
      const re = new RegExp(pattern, "g");
      if (re.test(out)) {
        out = out.replace(new RegExp(pattern, "g"), (m) => markOf(m));
      }
    } catch {

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
  useEffect(() => {
    if (threads.length === 0) return;
    const t = setTimeout(() => setFlash(true), 0);
    const timer = setTimeout(() => setFlash(false), 800);
    return () => {
      clearTimeout(t);
      clearTimeout(timer);
    };
  }, [threads.length]);
  useEffect(() => {
    function handleJump(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { fieldKey?: AnnotationFieldKey; snippet?: string }
        | undefined;
      if (!detail || detail.fieldKey !== fieldKey) return;
      const el = rootRef.current;
      if (!el) return;
      const snippet = detail.snippet;
      if (snippet) {
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

            const have = normalizeText(m.textContent || "").toLowerCase();
            if (want.length < 12 || have.length < 12) return false;
            return (
              have.startsWith(want.slice(0, 12)) ||
              want.startsWith(have.slice(0, 12))
            );
          }) ||
          (marks.length === 1 ? marks[0] : undefined);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.classList.add("annotation-pulse");
          setTimeout(() => target.classList.remove("annotation-pulse"), 2200);
          return;
        }
        window.dispatchEvent(
          new CustomEvent("annotation-jump-miss", {
            detail: { fieldKey, snippet },
          }),
        );
      }

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