// ============================================================
// RichTextView — renders rich-text HTML safely for display.
// Used on submission/detail pages where TAF content is shown
// (content is authored via TipTap, whose schema only allows
// safe nodes/marks, so dangerouslySetInnerHTML is acceptable).
// Falls back to plain text rendering for legacy non-HTML rows.
// ============================================================

import { cn } from "@/lib/utils";
import { looksLikeHtml, plainTextToHtml } from "@/lib/html";

type Props = {
  html: string | null | undefined;
  className?: string;
  maxHeight?: string;
  fallback?: string;
  /**
   * Layout hint for plain-text input. "references" renders one hanging-indent
   * entry per line (ACM list) — used by the References block.
   */
  plainTextStyle?: "prose" | "references";
};

export default function RichTextView({
  html,
  className,
  maxHeight,
  fallback = "—",
  plainTextStyle,
}: Props) {
  if (!html) {
    return <p className={cn("text-sm text-[#333]", className)}>{fallback}</p>;
  }

  // Plain text (legacy rows AND the AI's improved output, which arrives as
  // plain text) is STRUCTURED rather than dumped as one pre-wrapped blob —
  // the improved "After" panel used to show a single run-on string with
  // literal "- " / "1. " markers instead of real paragraphs and lists.
  const content = looksLikeHtml(html)
    ? html
    : plainTextToHtml(html, { style: plainTextStyle });

  return (
    <div
      className={cn("rich-text-content", className)}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
