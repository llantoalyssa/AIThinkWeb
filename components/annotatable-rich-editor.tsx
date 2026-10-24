"use client";
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

          const have = normalized(b);
          if (want.length < 12 || have.length < 12) return false;
          return want.startsWith(have.slice(0, 12)) || have.startsWith(want.slice(0, 12));
        });

      const target = looseMatch || blocks[0];
      if (!target) return;
      if (!looseMatch && want.length > 0) {
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
function flashOverlay(target: HTMLElement) {
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

    document.body.appendChild(overlay);

    const remove = () => overlay.remove();

    window.setTimeout(() => {
      overlay.style.opacity = "0";
      window.setTimeout(remove, 450);
    }, 1400);
  }, 60);
}