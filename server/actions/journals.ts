"use server";

import { createClient } from "@/server/supabase/server";
import { describePage, layoutPageText } from "@/lib/pdf-layout";
import {
  analysisRatePerToken,
  resolveAnalysisModel,
  resolveAnalysisProvider,
} from "@/server/analysis/ai-analysis";
import { getMyGrantedPermissions } from "@/server/actions/permissions";
import { embedText } from "@/server/analysis/similarity";
import { logAudit } from "@/server/audit";

const PAGE_TEXT_MIN_CHARS = 40;

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u00AD/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F]/g, " ")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬀ/g, "ff")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl")
    .replace(/ﬅ/g, "ft")
    .replace(/ﬆ/g, "st")
    // line-end hyphenation: "conclu-\nsion" → "conclusion"
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n");
}

export type PdfPagesResult =
  | {
      success: true;
      /** One entry per page, in page order (empty string = no text layer). */
      pages: string[];
      /** 1-based page numbers whose text layer is too thin to trust. */
      thinPages: number[];
    }
  | { success: false; error: string };

export async function extractPdfPages(fileUrl: string): Promise<PdfPagesResult> {
  const supabase = await createClient();

  const storagePath = fileUrl.replace(/^.*\/journals\//, "");
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("journals")
    .download(storagePath);

  if (downloadError || !fileData) {
    console.error("Download error:", downloadError);
    return { success: false, error: "Could not download the PDF." };
  }

  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = new Uint8Array(await fileData.arrayBuffer());

    let standardFontDataUrl: string | undefined;
    try {
      const { createRequire } = await import("module");
      const require2 = createRequire(import.meta.url);
      const pkgPath = require2.resolve("pdfjs-dist/package.json");
      const pdfjsRoot = pkgPath.replace(/package\.json$/, "");
      const fontsDir = pdfjsRoot + "standard_fonts/";
      const { existsSync } = await import("fs");
      if (existsSync(fontsDir)) {
        standardFontDataUrl = fontsDir;
      }
    } catch (fontErr) {
      console.warn("[extractPdfText] Could not resolve standard fonts:", fontErr);
    }

    const doc = await pdfjs.getDocument({
      data: bytes,
      standardFontDataUrl,
    }).promise;

    const numPages = doc.numPages;
    const pages: string[] = [];

    try {
      for (let i = 1; i <= numPages; i++) {
        const page = await doc.getPage(i);
        try {
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent({
            includeMarkedContent: false,
          });

          const items = [];
          for (const raw of content.items as Array<Record<string, unknown>>) {
            if (typeof raw.str !== "string" || raw.str.length === 0) continue;
            const transform = raw.transform as number[] | undefined;
            const height = Math.abs(Number(raw.height) || 0);
            items.push({
              str: raw.str,
              // transform = [a, b, c, d, e, f]: e = x of the origin, f = baseline y.
              x: Number(transform?.[4] ?? 0),
              y: Number(transform?.[5] ?? 0),
              width: Number(raw.width) || 0,
              // A missing height would collapse the line clustering, so fall
              // back to the font size the transform encodes.
              height: height || Math.abs(Number(transform?.[3]) || 0) || 10,
              hasEOL: Boolean(raw.hasEOL),
            });
          }

          // Reading order: strips → columns → lines (lib/pdf-layout.ts).
          const layout = layoutPageText(items, viewport.width);
          if (layout.thin) {
            // Counts only — never log document contents.
            console.warn(`[extractPdfText] ${describePage(layout, i)}`);
          }
          pages.push(layout.text);
        } finally {
          // cleanup() is sync in some builds and a promise in others; never let
          // it mask the real error.
          try {
            await page.cleanup();
          } catch {
            /* ignore */
          }
        }
      }
    } finally {
      try {
        await doc.cleanup();
      } catch {
        /* ignore */
      }
    }

    const joined = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    const totalChars = joined.length;
    console.info(
      `[extractPdfText] ${numPages} page(s) → ${totalChars} chars (${(totalChars / Math.max(numPages, 1)).toFixed(0)}/page)`,
    );
    const normalized = pages.map((p) => normalizeExtractedText(p));
    const thinPages = normalized
      .map((p, index) => ({ index, chars: p.trim().length }))
      .filter((entry) => entry.chars < PAGE_TEXT_MIN_CHARS)
      .map((entry) => entry.index + 1);

    return {
      success: true,
      pages: normalized,
      thinPages,
    };
  } catch (err) {
    console.error("PDF extraction error:", err);
    return { success: false, error: "Could not read the PDF." };
  }
}

export async function extractPdfText(fileUrl: string): Promise<string> {
  const result = await extractPdfPages(fileUrl);
  if (!result.success) return "";
  return result.pages
    .filter((p) => p.trim().length > 0)
    .join("\n\n")
    .trim();
}

import { getCurrentUser } from "./auth";

// ── Types ──────────────────────────────────────────────────

export type Journal = {
  id: string;
  departmentId: string;
  title: string;
  authors: string | null;
  year: string | null;
  fileUrl: string;
  hasText: boolean;
  createdAt: string;
};

export type SaveJournalInput = {
  title: string;
  authors: string; // comma-separated
  year: string;
  fileUrl: string;
  extractedText: string;
};

export type JournalActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const EMBEDDING_CORE_CHARS = 1_200;

const SECTION_BOUNDARIES = [
  /\bintroduction\b/i,
  /\babstract\b/i,
  /\brecommendation/i,
  /\bconclusion/i,
  /\breferences?\b/i,
  /\bkeywords?\b/i,
  /\bdiscussion\b/i,
  /\bresults?\b/i,
  /\bmethodology\b/i,
];

function extractEmbeddingCore(title: string, fullText: string): string {
  const clean = fullText.replace(/\s+/g, " ").trim();
  if (!clean) return title.trim();

  // Cut at the first section boundary so recommendations etc. are excluded.
  let cutAt = clean.length;
  for (const re of SECTION_BOUNDARIES) {
    const m = clean.match(re);
    if (m && m.index !== undefined && m.index > 0 && m.index < cutAt) {
      cutAt = m.index;
    }
  }

  // Keep the head (abstract + early intro) — bounded.
  const core = clean.slice(0, Math.min(cutAt, EMBEDDING_CORE_CHARS)).trim();
  // Fall back to the title if we ended up with almost nothing.
  return core.length >= 40 ? core : title.trim();
}

async function embedJournalText(text: string): Promise<number[] | null> {
  try {
    return await embedText(text);
  } catch (embedError) {
    console.error("Error generating embedding:", embedError);
    return null;
  }
}

export type JournalView = {
  id: string;
  title: string;
  authors: string | null;
  year: string | null;
  fileUrl: string;
  hasText: boolean;
  extractedText: string;
};

export async function getJournalById(
  journalId: string,
): Promise<JournalActionResult<JournalView>> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("journals")
    .select("id, title, authors, year, file_url, extracted_text")
    .eq("id", journalId)
    .single();

  if (error || !data) {
    console.error("Error fetching journal:", error);
    return { success: false, error: "Journal not found." };
  }

  const row = data as Record<string, unknown>;
  const extractedText = ((row.extracted_text as string) || "").trim();
  return {
    success: true,
    data: {
      id: row.id as string,
      title: (row.title as string) || "Untitled",
      authors: (row.authors as string) || null,
      year: (row.year as string) || null,
      fileUrl: (row.file_url as string) || "",
      hasText: !!extractedText,
      extractedText,
    },
  };
}

// ── Get all journals ───────────────────────────────────────

export async function getAllJournals(): Promise<
  JournalActionResult<Journal[]>
> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const granted = await getMyGrantedPermissions();
  if (!granted.includes("pages.journals")) {
    return {
      success: false,
      error:
        "This account has not been granted the Journals page. Ask a department account to grant it.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("journals")
    .select("id, department_id, title, authors, year, file_url, extracted_text, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching journals:", error);
    return { success: false, error: "Failed to fetch journals." };
  }

  const journals: Journal[] = (data || []).map((j) => ({
    id: j.id,
    departmentId: (j as any).department_id,
    title: (j as any).title,
    authors: (j as any).authors || null,
    year: (j as any).year || null,
    fileUrl: (j as any).file_url,
    hasText: !!((j as any).extracted_text),
    createdAt: (j as any).created_at,
  }));

  return { success: true, data: journals };
}

// ── Save journal (with pre-extracted text + AI metadata) ───

export async function saveJournal(
  input: SaveJournalInput
): Promise<JournalActionResult<Journal>> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can upload journals." };
  }

  if (!input.title || input.title.trim().length < 2) {
    return { success: false, error: "Title must be at least 2 characters." };
  }
  if (!input.fileUrl) {
    return { success: false, error: "File URL is required." };
  }

  const supabase = await createClient();

  // ── Save to journals table ───────────────────────────────
  const { data: journal, error: insertError } = await supabase
    .from("journals")
    .insert({
      department_id: user.id,
      title: input.title.trim(),
      authors: input.authors.trim() || null,
      year: input.year.trim() || null,
      file_url: input.fileUrl,
      extracted_text: input.extractedText,
      embedding_text: extractEmbeddingCore(input.title, input.extractedText),
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error inserting journal:", insertError);
    return { success: false, error: "Failed to save journal." };
  }

  const coreText = extractEmbeddingCore(input.title, input.extractedText);
  if (coreText.trim().length > 0) {
    const embedding = await embedJournalText(coreText);
    if (embedding && embedding.length > 0) {
      await supabase
        .from("journals")
        .update({ embedding: `[${embedding.join(",")}]` })
        .eq("id", journal.id);
    }
  }

  const result: Journal = {
    id: journal.id,
    departmentId: (journal as any).department_id,
    title: (journal as any).title,
    authors: (journal as any).authors || null,
    year: (journal as any).year || null,
    fileUrl: (journal as any).file_url,
    hasText: true,
    createdAt: (journal as any).created_at,
  };

  return { success: true, data: result };
}


export type UpdateJournalInput = {
  title: string;
  authors: string;
  year: string;
};

export async function updateJournal(
  journalId: string,
  input: UpdateJournalInput
): Promise<JournalActionResult<Journal>> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }
  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can update journals." };
  }
  if (!input.title || input.title.trim().length < 2) {
    return { success: false, error: "Title must be at least 2 characters." };
  }

  const supabase = await createClient();

  // Load existing text so we can recompute the embedding core on title change.
  const { data: existing, error: fetchErr } = await supabase
    .from("journals")
    .select("id, extracted_text, embedding_text")
    .eq("id", journalId)
    .single();

  if (fetchErr || !existing) {
    console.error("Error fetching journal for update:", fetchErr);
    return { success: false, error: "Journal not found." };
  }

  const fullText = ((existing as any).extracted_text as string) || "";

  const { data: updated, error: updateErr } = await supabase
    .from("journals")
    .update({
      title: input.title.trim(),
      authors: input.authors.trim() || null,
      year: input.year.trim() || null,
      embedding_text: extractEmbeddingCore(input.title.trim(), fullText),
    })
    .eq("id", journalId)
    .select()
    .single();

  if (updateErr) {
    console.error("Error updating journal:", updateErr);
    return { success: false, error: "Failed to update journal." };
  }

  // Re-embed from the (possibly new) title + abstract core.
  const coreText = extractEmbeddingCore(input.title.trim(), fullText);
  if (coreText.trim().length > 0) {
    const embedding = await embedJournalText(coreText);
    if (embedding && embedding.length > 0) {
      await supabase
        .from("journals")
        .update({ embedding: `[${embedding.join(",")}]` })
        .eq("id", journalId);
    }
  }

  return {
    success: true,
    data: {
      id: (updated as any).id,
      departmentId: (updated as any).department_id,
      title: (updated as any).title,
      authors: (updated as any).authors || null,
      year: (updated as any).year || null,
      fileUrl: (updated as any).file_url,
      hasText: !!fullText.trim(),
      createdAt: (updated as any).created_at,
    },
  };
}

// ── Log journal AI extraction cost ─────────────────────────

export async function logJournalExtractCost(input: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  journalTitle?: string;
  /** Whatever extractJournalMetadata() reported — the provider that ANSWERED. */
  provider?: "gemini" | "opencode-go";
  model?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();

  const provider = input.provider ?? resolveAnalysisProvider();
  const model = input.model ?? resolveAnalysisModel();
  const rates = analysisRatePerToken();
  const aiCost =
    input.promptTokens * rates.input + input.completionTokens * rates.output;
  const totalCost = Math.round(aiCost * 1e8) / 1e8;

  await supabase.from("analysis_cost_logs").insert({
    user_id: user.id,
    title: input.journalTitle || "Journal metadata extraction",
    source: "journal",
    ai_provider: provider,
    ai_model: model,
    ai_input_tokens: input.promptTokens,
    ai_output_tokens: input.completionTokens,
    ai_cost: totalCost,
    total_cost: totalCost,
  });
}

// ── Delete journal ─────────────────────────────────────────

export async function deleteJournal(
  journalId: string
): Promise<JournalActionResult<null>> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can delete journals." };
  }

  const supabase = await createClient();

  const { data: journal } = await supabase
    .from("journals")
    .select("file_url")
    .eq("id", journalId)
    .single();

  if (journal) {
    const filePath = (journal as any).file_url.replace(/^.*\/journals\//, "");
    await supabase.storage.from("journals").remove([filePath]);
  }

  const { error } = await supabase
    .from("journals")
    .delete()
    .eq("id", journalId);

  if (error) {
    console.error("Error deleting journal:", error);
    return { success: false, error: "Failed to delete journal." };
  }

  await logAudit({
    action: "journal_deleted",
    category: "deletion",
    entityType: "journal",
    entityId: journalId,
    description: "Deleted a journal from the reference library.",
    actor: { id: user.id, email: user.email, role: user.role },
  });

  return { success: true, data: null };
}


export async function reembedJournals(): Promise<
  | { success: true; data: { reembedded: number; skipped: number } }
  | { success: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }
  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can re-embed journals." };
  }

  const supabase = await createClient();

  const { data: journals, error: fetchErr } = await supabase
    .from("journals")
    .select("id, title, extracted_text, embedding_text")
    .order("created_at", { ascending: false });

  if (fetchErr) {
    console.error("[reembedJournals] Failed to fetch journals:", fetchErr);
    return { success: false, error: "Failed to fetch journals." };
  }

  let reembedded = 0;
  let skipped = 0;

  for (const j of (journals || []) as Record<string, unknown>[]) {
    const title = (j.title as string) || "";
    const fullText = (j.extracted_text as string) || "";
    const core = extractEmbeddingCore(title, fullText);
    if (!core.trim()) {
      skipped++;
      continue;
    }

    const embedding = await embedJournalText(core);
    if (!embedding || embedding.length === 0) {
      skipped++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from("journals")
      .update({
        embedding_text: core,
        embedding: `[${embedding.join(",")}]`,
      })
      .eq("id", j.id);

    if (updateErr) {
      console.error(`[reembedJournals] Failed for ${j.id}:`, updateErr);
      skipped++;
    } else {
      reembedded++;
    }
  }

  return { success: true, data: { reembedded, skipped } };
}