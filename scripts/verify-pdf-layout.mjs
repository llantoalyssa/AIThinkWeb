// Verification for lib/pdf-layout.ts — reading order, character retention and
// column detection, driven by synthetic PDF text-item fixtures (no PDF file, no
// pdfjs needed: the layout engine is pure by design so it CAN be tested like
// this).
//
// Run:  node scripts/verify-pdf-layout.mjs
// (expects lib/pdf-layout.ts compiled next to it; see the npm-independent
// command in the report: npx tsc lib/pdf-layout.ts --outDir .pdfcheck)

import { layoutPageText } from "../.pdfcheck/pdf-layout.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

/** Build one item on a 612pt-wide page. */
function item(str, x, y, width, height = 11) {
  return { str, x, y, width, height };
}

// ── Fixture 1: single column, paragraphs ────────────────────────────────────
{
  console.log("\nFixture 1 — single column with a paragraph break");
  const items = [
    item("Introduction to the study", 60, 700, 220, 14),
    item("This paper examines", 60, 670, 160),
    item("capstone projects.", 225, 670, 130),
    item("A second sentence follows here.", 60, 656, 250),
    // paragraph gap (~2 lines)
    item("A new paragraph starts after the gap.", 60, 620, 280),
    item("And it continues on this line.", 60, 606, 220),
  ];
  const layout = layoutPageText(items, 612);
  check("columns detected as 1", layout.columns === 1, `got ${layout.columns}`);
  check("lines are separated", layout.text.includes("\n"));
  check(
    "words joined across one line",
    layout.text.includes("This paper examines capstone projects."),
    layout.text.slice(0, 120),
  );
  check(
    "paragraph break preserved",
    /\n\nA new paragraph/.test(layout.text),
    JSON.stringify(layout.text),
  );
  check("nothing dropped", layout.items === items.length);
}

// ── Fixture 2: two columns, INTERLEAVED content-stream order ────────────────
// This is the bug being fixed: the stream alternates left/right/left/right, so
// the old `join(" ")` produced "L1 R1 L2 R2" and read straight across.
{
  console.log("\nFixture 2 — two columns with an interleaved stream");
  const items = [
    item("Left column line one continues", 60, 700, 240),
    item("Right column line one continues", 320, 700, 240),
    item("Left column line two continues", 60, 686, 240),
    item("Right column line two continues", 320, 686, 240),
    item("Left column line three ends.", 60, 672, 240),
    item("Right column line three ends.", 320, 672, 240),
    item("Left footnote text here.", 60, 640, 200),
    item("Right footnote text here.", 320, 640, 200),
  ];
  const layout = layoutPageText(items, 612);
  const text = layout.text;
  check("two columns detected", layout.columns === 2, `got ${layout.columns}`);
  check(
    "left column read to its end before the right",
    text.indexOf("Left column line three") < text.indexOf("Right column line one"),
    text,
  );
  check(
    "right column order preserved",
    text.indexOf("Right column line one") < text.indexOf("Right column line three"),
    text,
  );
  check(
    "no line mixes the two columns",
    !/Left column line one continues Right column/.test(text),
    text,
  );
}

// ── Fixture 3: full-width heading above two columns ─────────────────────────
{
  console.log("\nFixture 3 — full-width title above two columns");
  const items = [
    item("A Study Of Capstone Project Similarity In Computing", 60, 740, 500, 16),
    item("Left body line one.", 60, 700, 240),
    item("Right body line one.", 320, 700, 240),
    item("Left body line two.", 60, 686, 240),
    item("Right body line two.", 320, 686, 240),
  ];
  const layout = layoutPageText(items, 612);
  const text = layout.text;
  check(
    "title comes first",
    text.indexOf("A Study Of Capstone") === 0,
    text.slice(0, 80),
  );
  check(
    "title is not swallowed by a column",
    text.indexOf("A Study Of Capstone") < text.indexOf("Left body line one"),
    text,
  );
  check("both columns still read in order", text.indexOf("Left body line two") < text.indexOf("Right body line one"));
}

// ── Fixture 4: characters and spacing survive ───────────────────────────────
{
  console.log("\nFixture 4 — punctuation + adjacent glyphs");
  const items = [
    item("Nguy\u1ec5n V\u0103n A \u2014 \u201cquoted\u201d, 100% (test) [1].", 60, 700, 300),
    item("fMRI O'Brien-Smith & Co. #4 @home", 60, 686, 260),
  ];
  const layout = layoutPageText(items, 612);
  check("diacritics kept", layout.text.includes("Nguy\u1ec5n V\u0103n A"), layout.text);
  check("em dash kept", layout.text.includes("\u2014"));
  check("smart quotes kept", layout.text.includes("\u201cquoted\u201d"));
  check("percent and brackets kept", layout.text.includes("100% (test) [1]."));
  check("no undefined leaked in", !/undefined/.test(layout.text), layout.text);
}

// ── Fixture 5: thin page is flagged (OCR decision) ──────────────────────────
{
  console.log("\nFixture 5 — image-only page is flagged thin");
  const layout = layoutPageText([], 612);
  check("no text", layout.text === "");
  check("flagged thin", layout.thin === true);
  const sparse = layoutPageText([item("1", 300, 40, 4)], 612);
  check("page number alone is thin", sparse.thin === true, JSON.stringify(sparse.text));
}

console.log(
  failures === 0
    ? "\nAll layout checks passed."
    : `\n${failures} layout check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
