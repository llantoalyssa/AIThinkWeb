// ============================================================
// HTML helpers — server-safe (no DOM required)
// Used to strip rich-text HTML before embedding / AI prompts
// so tags don't pollute similarity scores or LLM input.
// ============================================================

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * Convert rich-text HTML into plain text for comparison/embedding.
 * Strips tags, decodes common entities, collapses whitespace.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ") // strip tags
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITY_MAP[m] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True if a string looks like rich-text HTML (contains block tags).
 * Used to detect whether a TAF field was authored in the rich editor
 * (old plain-text rows stay plain text and need no HTML stripping).
 */
export function looksLikeHtml(text: string | null | undefined): boolean {
  if (!text) return false;
  return /<(p|div|h[1-6]|ul|ol|li|blockquote|strong|b|em|i|u|s|a|br|pre|code)[\s>]/i.test(
    text
  );
}

// ── Document structuring ────────────────────────────────────────────
// Markers used by TAF prose and by the AI's improved output.
const BULLET_LINE_RE = /^[-*•·–—]\s+/;
const ORDERED_LINE_RE = /^\(?(\d{1,2})[.)]\s+/;
const REFERENCE_LINE_RE = /^\[\d{1,3}\]\s*/;
const MD_BOLD_RE = /\*\*(?!\s)([\s\S]+?)(?<!\s)\*\*/g;
const MD_ITALIC_RE = /(^|[\s(])\*(?!\s)([^*\n]+?)(?<!\s)\*(?=$|[\s).,;:!?])/g;

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inline formatting for ONE logical line: escape first (plain text must never
 * be injected raw), then honour the light markdown the model sometimes emits.
 */
function renderInline(line: string): string {
  return escapeHtmlText(line)
    .replace(MD_BOLD_RE, "<strong>$1</strong>")
    .replace(MD_ITALIC_RE, "$1<em>$2</em>");
}

export type PlainTextToHtmlOptions = {
  /**
   * Force how the block is laid out. "references" emits one hanging-indent
   * entry per line (ACM list), regardless of markers.
   */
  style?: "prose" | "references";
};

/**
 * Convert plain text (with newlines) into STRUCTURED HTML for the rich text
 * editor, the read-only views and the exported PDF.
 *
 * The old version split only on blank lines and joined everything else with
 * <br>, so AI-improved content — which arrives as one block of lines with no
 * blank lines — collapsed into a single run-on paragraph whose "- " and "1. "
 * markers stayed literal text. That is why an improved TAF lost its paper
 * layout. This version rebuilds the document:
 *
 *   • blank lines          → paragraph breaks
 *   • "- " / "* " / "• "   → real <ul><li>
 *   • "1." / "1)" / "(1)"  → real <ol><li> (start number preserved)
 *   • "[1] ..."            → hanging-indent reference entry (<p class="doc-ref">)
 *   • every other line     → its own <p>, so paragraphs keep their spacing
 *   • **bold** / *italic*  → <strong> / <em>
 *
 * HTML input is returned unchanged.
 */
export function plainTextToHtml(
  text: string | null | undefined,
  options?: PlainTextToHtmlOptions
): string {
  if (!text) return "";
  if (looksLikeHtml(text)) return text;

  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n");

  const html: string[] = [];
  const paragraphs: string[] = [];

  for (const rawBlock of normalized.split(/\n\s*\n/)) {
    const lines = rawBlock
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    // A block counts as a list when the marker dominates its lines, so a real
    // paragraph that merely starts with a dash is not mangled.
    const majority = Math.ceil(lines.length * 0.6);
    const bulletCount = lines.filter((l) => BULLET_LINE_RE.test(l)).length;
    const orderedCount = lines.filter((l) => ORDERED_LINE_RE.test(l)).length;
    const refCount = lines.filter((l) => REFERENCE_LINE_RE.test(l)).length;

    if (options?.style === "references" || refCount >= majority) {
      for (const line of lines) {
        html.push(`<p class="doc-ref">${renderInline(line)}</p>`);
      }
      continue;
    }

    // A leading PROSE line followed by list items — the classic objectives
    // shape ("The general objective is ….  1. To …  2. To …") — must keep that
    // prose line as its own paragraph. Absorbing it made the numbered specific
    // objective read as the first thing in the section.
    const firstIsListItem =
      BULLET_LINE_RE.test(lines[0]) || ORDERED_LINE_RE.test(lines[0]);
    const restAreListItems = lines
      .slice(1)
      .every((l) => BULLET_LINE_RE.test(l) || ORDERED_LINE_RE.test(l));

    if (lines.length > 1 && !firstIsListItem && restAreListItems) {
      const rest = lines.slice(1);
      html.push(`<p>${renderInline(lines[0])}</p>`);
      const restOrdered =
        rest.filter((l) => ORDERED_LINE_RE.test(l)).length >=
        Math.ceil(rest.length * 0.6);
      if (restOrdered) {
        const first = Number.parseInt(
          rest[0].match(ORDERED_LINE_RE)?.[1] ?? "1",
          10
        );
        const startAttr =
          Number.isFinite(first) && first > 1 ? ` start="${first}"` : "";
        html.push(
          `<ol${startAttr}>${rest
            .map((l) => `<li>${renderInline(l.replace(ORDERED_LINE_RE, ""))}</li>`)
            .join("")}</ol>`
        );
      } else {
        html.push(
          `<ul>${rest
            .map((l) => `<li>${renderInline(l.replace(BULLET_LINE_RE, ""))}</li>`)
            .join("")}</ul>`
        );
      }
      continue;
    }

    if (bulletCount >= majority) {
      html.push(
        `<ul>${lines
          .map((l) => `<li>${renderInline(l.replace(BULLET_LINE_RE, ""))}</li>`)
          .join("")}</ul>`
      );
      continue;
    }

    if (orderedCount >= majority) {
      const first = Number.parseInt(
        lines[0].match(ORDERED_LINE_RE)?.[1] ?? "1",
        10
      );
      const startAttr = Number.isFinite(first) && first > 1 ? ` start="${first}"` : "";
      html.push(
        `<ol${startAttr}>${lines
          .map((l) => `<li>${renderInline(l.replace(ORDERED_LINE_RE, ""))}</li>`)
          .join("")}</ol>`
      );
      continue;
    }

    for (const line of lines) {
      // A line that continues the previous one — the previous line did not end
      // a sentence AND this one starts mid-sentence (lowercase) — is a
      // hard-wrapped continuation (pasted text), so it joins the SAME
      // paragraph. Everything else is its own paragraph, which is what keeps
      // AI output (one logical sentence per line) from collapsing back into a
      // single run-on block.
      const prev = paragraphs[paragraphs.length - 1];
      const isContinuation =
        prev !== undefined &&
        !/[.!?:;"')\]]\s*$/.test(prev) &&
        /^[a-z(]/.test(line);
      if (isContinuation) paragraphs[paragraphs.length - 1] = `${prev} ${line}`;
      else paragraphs.push(line);
    }
  }

  for (const paragraph of paragraphs) {
    html.push(`<p>${renderInline(paragraph)}</p>`);
  }

  return html.join("");
}

/**
 * Convert rich-text HTML into plain text for editing in a <textarea>.
 * Unlike htmlToPlainText (which collapses whitespace for similarity),
 * this preserves line breaks: block tags (</p>, </div>, </li>, headings)
 * and <br> become newlines, then tags are stripped and entities decoded.
 * Plain text input is returned unchanged.
 */
export function htmlToTextareaText(
  html: string | null | undefined
): string {
  if (!html) return "";
  if (!looksLikeHtml(html)) return html;

  return html
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "") // strip remaining tags
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITY_MAP[m] ?? " ")
    .replace(/[ \t]+\n/g, "\n") // trailing spaces before newline
    .replace(/\n{3,}/g, "\n\n") // max one blank line
    .trim();
}
