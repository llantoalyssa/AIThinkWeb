// ============================================================
// PDF layout engine — reading order for extracted PDF text.
//
// WHY: the old extractor did `items.map(i => i.str).join(" ")`, which threw away
// every line break AND read items in CONTENT-STREAM order. On a two-column
// research paper the stream often alternates between columns, so the text came
// out reading straight across — "…end of the left columnThe right column begins
// …" — and every page arrived as one enormous line, which wrecked paragraph
// boundaries and the downstream sentence/token heuristics.
//
// WHAT THIS DOES, in order:
//   1. FULL-WIDTH items (titles, section rules, page numbers) split the page
//      into horizontal STRIPS, because a heading that spans both columns must
//      not be swallowed by whichever column happens to be scanned first.
//   2. Inside a strip, vertical GUTTERS (contiguous x-ranges no item covers)
//      are detected and the strip is split into COLUMNS — only gutters wide
//      enough to be real are accepted, and each side has to hold a meaningful
//      share of the items, so a wide word gap is not mistaken for a column break.
//   3. Columns are read LEFT TO RIGHT, and each column TOP TO BOTTOM, with
//      lines rebuilt from the item coordinates and paragraph breaks taken from
//      the vertical gaps.
//
// Deliberately dependency-free and PURE (no pdfjs import): it takes plain
// `{str, x, y, width, height}` items, so it can be unit-tested without a PDF.
// ============================================================

/** One text item as PDF.js reports it, flattened to what layout needs. */
export type PdfTextItem = {
  str: string;
  /** Horizontal position of the item's LEFT edge, in PDF user units. */
  x: number;
  /** Baseline y (PDF user space: bigger = higher on the page). */
  y: number;
  width: number;
  height: number;
  /** PDF.js marks the last item of a line. Used as a hint, never trusted alone. */
  hasEOL?: boolean;
};

export type PageLayout = {
  text: string;
  /** Columns detected on the page (1 = single column). */
  columns: number;
  items: number;
  chars: number;
  /** Rough quality flag for diagnostics: true when almost nothing came out. */
  thin: boolean;
};

type Box = PdfTextItem & {
  /** Right edge. */
  right: number;
  /** Vertical centre — the value strips/columns are assigned by. */
  midY: number;
};

// A gutter only has to be WIDER THAN A WORD SPACE to be a column break; the
// `isBalanced` check is what rejects a stray wide gap (a figure caption, a
// centred page number), so these stay deliberately permissive. 2% of a 612pt
// page is ~12pt — comfortably larger than any inter-word gap.
const MIN_COLUMN_GUTTER_RATIO = 0.02; // of page width
const MIN_COLUMN_GUTTER_PX = 10; // absolute floor, in user units
const FULL_WIDTH_RATIO = 0.55; // an item this wide spans columns
const LINE_TOLERANCE_RATIO = 0.55; // of the median line height
const PARAGRAPH_GAP_RATIO = 1.65; // line gaps bigger than this break a paragraph
const SPACE_GAP_RATIO = 0.28; // of font height, before a space is inserted

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Turn one page's text items into reading-order text.
 *
 * `pageWidth` is the page's viewport width; when omitted it is derived from the
 * items themselves (widest right edge).
 */
export function layoutPageText(
  rawItems: PdfTextItem[],
  pageWidth?: number,
): PageLayout {
  const items: Box[] = rawItems
    .filter((it) => typeof it.str === "string" && it.str.trim().length > 0)
    .map((it) => ({
      ...it,
      height: it.height > 0 ? it.height : 10,
      right: it.x + Math.max(it.width, 0),
      midY: it.y - (it.height > 0 ? it.height : 10) / 2,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  if (items.length === 0) {
    return { text: "", columns: 1, items: 0, chars: 0, thin: true };
  }

  const width =
    pageWidth && pageWidth > 0
      ? pageWidth
      : Math.max(...items.map((i) => i.right), 1);
  const lineHeight = median(items.map((i) => i.height)) || 10;
  const lineTolerance = lineHeight * LINE_TOLERANCE_RATIO;
  const minGutter = Math.max(width * MIN_COLUMN_GUTTER_RATIO, MIN_COLUMN_GUTTER_PX);

  // ── 1. Full-width items → horizontal strips ────────────────────────────
  const fullWidth = items.filter(
    (i) => i.right - i.x >= width * FULL_WIDTH_RATIO,
  );
  // A full-width item is only a strip separator when it really is alone on its
  // line — otherwise a long body line in a single-column document would be
  // treated as a heading and shred the page into strips.
  const stripItems = fullWidth.filter((i) => {
    const sameLine = items.filter(
      (other) => other !== i && Math.abs(other.midY - i.midY) <= lineTolerance,
    );
    return sameLine.length === 0;
  });

  const segments: { kind: "strip" | "body"; items: Box[] }[] = [];
  const stripBoxes = [...stripItems].sort((a, b) => b.midY - a.midY);

  let top = Math.max(...items.map((i) => i.y + i.height));
  const firstBoxTop = Math.max(...items.map((i) => i.y));
  top = Math.max(top, firstBoxTop);

  for (const box of stripBoxes) {
    // Everything still unconsumed ABOVE this full-width item is body text for
    // its own strip; `top` walks down so no item is emitted twice.
    const above = items.filter(
      (i) => i.midY > box.midY + lineTolerance && i.midY < top && i !== box,
    );
    if (above.length > 0) segments.push({ kind: "body", items: above });
    segments.push({ kind: "strip", items: [box] });
    top = box.midY - lineTolerance;
  }

  const rest = items.filter((i) => i.midY < top && !stripBoxes.includes(i));
  if (rest.length > 0) segments.push({ kind: "body", items: rest });

  // ── 2. Emit segments in order ──────────────────────────────────────────
  const blocks: string[] = [];
  let columns = 1;

  for (const segment of segments) {
    if (segment.kind === "strip") {
      blocks.push(lineText(segment.items, lineHeight));
      continue;
    }
    const gutters = findGutters(segment.items, minGutter, width);
    columns = Math.max(columns, gutters.length + 1);
    const bands = splitIntoBands(segment.items, gutters);
    for (const band of bands) {
      const text = bandText(band, lineTolerance, lineHeight);
      if (text.trim()) blocks.push(text);
    }
  }

  const text = blocks
    .filter((b) => b.trim().length > 0)
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text,
    columns,
    items: items.length,
    chars: text.length,
    thin: text.length < 40,
  };
}

/**
 * Vertical gutters inside one strip: contiguous x-ranges that NO item covers.
 * A gutter only counts when it is wide enough to be a column break and both
 * sides hold at least a few items (a lone figure caption on the right must not
 * turn a single-column page into two).
 */
function findGutters(items: Box[], minGutter: number, pageWidth: number): number[] {
  // Four items is enough for two short columns (2 + 2); `isBalanced` still
  // requires a real share on both sides, so this cannot invent a column.
  if (items.length < 4) return [];

  const bins = 400;
  const step = pageWidth / bins;
  const covered = new Array<boolean>(bins).fill(false);
  for (const item of items) {
    const start = Math.max(0, Math.floor(item.x / step));
    const end = Math.min(bins - 1, Math.ceil(item.right / step));
    for (let b = start; b <= end; b++) covered[b] = true;
  }

  const gutters: number[] = [];
  let runStart = -1;
  for (let b = 0; b < bins; b++) {
    if (!covered[b]) {
      if (runStart === -1) runStart = b;
      continue;
    }
    if (runStart !== -1) {
      const runWidth = (b - runStart) * step;
      const centre = (runStart + (b - runStart) / 2) * step;
      if (runWidth >= minGutter && isBalanced(items, centre)) gutters.push(centre);
      runStart = -1;
    }
  }
  // A trailing empty run at the page edge is a margin, not a gutter.

  return gutters.slice(0, 3); // at most four columns
}

/** Both sides of a candidate gutter must hold a real share of the items. */
function isBalanced(items: Box[], centre: number): boolean {
  const left = items.filter((i) => i.x + i.width / 2 < centre).length;
  const right = items.length - left;
  const minimum = Math.max(2, Math.floor(items.length * 0.08));
  return left >= minimum && right >= minimum;
}

function splitIntoBands(items: Box[], gutters: number[]): Box[][] {
  if (gutters.length === 0) return [items];
  const bands: Box[][] = Array.from({ length: gutters.length + 1 }, () => []);
  for (const item of items) {
    const centre = item.x + item.width / 2;
    let index = 0;
    while (index < gutters.length && centre > gutters[index]) index++;
    bands[index].push(item);
  }
  return bands.filter((band) => band.length > 0);
}

/** One band (a column, or the whole strip): lines top→bottom, words joined. */
function bandText(band: Box[], lineTolerance: number, lineHeight: number): string {
  const lines = groupLines(band, lineTolerance);
  const out: string[] = [];
  let previousY: number | null = null;

  for (const line of lines) {
    const text = lineText(line.items, lineHeight);
    if (!text) continue;
    if (previousY !== null) {
      const gap = previousY - line.y;
      if (gap > lineHeight * PARAGRAPH_GAP_RATIO) out.push("");
    }
    out.push(text);
    previousY = line.y;
  }

  return out.join("\n").trim();
}

/** Cluster items into lines by baseline, then sort each line left→right. */
function groupLines(band: Box[], tolerance: number): { y: number; items: Box[] }[] {
  const sorted = [...band].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: Box[] }[] = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current.y - item.y) <= tolerance) {
      current.items.push(item);
      // Keep the line's baseline as the most common one (the first item's).
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** Join a line's items, inserting a space only where the PDF left a real gap. */
function lineText(items: Box[], lineHeight: number): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let text = "";
  let previousRight: number | null = null;

  for (const item of sorted) {
    if (previousRight !== null) {
      const gap = item.x - previousRight;
      const needsSpace =
        gap > lineHeight * SPACE_GAP_RATIO &&
        !/\s$/.test(text) &&
        !/^\s/.test(item.str);
      if (needsSpace) text += " ";
    }
    text += item.str;
    previousRight = item.right;
  }

  return text.replace(/\s+/g, " ").trim();
}

/** Diagnostics for one page — counts only, never document contents. */
export function describePage(layout: PageLayout, pageNumber: number): string {
  return `page ${pageNumber}: ${layout.chars} chars from ${layout.items} items, ${layout.columns} column(s)${
    layout.thin ? " — THIN TEXT (possible scanned page or broken font encoding)" : ""
  }`;
}
