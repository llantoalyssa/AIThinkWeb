const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITY_MAP[m] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function looksLikeHtml(text: string | null | undefined): boolean {
  if (!text) return false;
  return /<(p|div|h[1-6]|ul|ol|li|blockquote|strong|b|em|i|u|s|a|br|pre|code)[\s>]/i.test(
    text
  );
}
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
function renderInline(line: string): string {
  return escapeHtmlText(line)
    .replace(MD_BOLD_RE, "<strong>$1</strong>")
    .replace(MD_ITALIC_RE, "$1<em>$2</em>");
}

export type PlainTextToHtmlOptions = {
  style?: "prose" | "references";
};
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
export function htmlToTextareaText(
  html: string | null | undefined
): string {
  if (!html) return "";
  if (!looksLikeHtml(html)) return html;

  return html
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITY_MAP[m] ?? " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}