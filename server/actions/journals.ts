"use server";

import { createClient } from "@/server/supabase/server";
export async function extractPdfText(fileUrl: string): Promise<string> {
  const supabase = await createClient();

  const storagePath = fileUrl.replace(/^.*\/journals\
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("journals")
    .download(storagePath);

  if (downloadError || !fileData) {
    console.error("Download error:", downloadError);
    return "";
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

    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: any) => item.str)
        .join(" ");
      pages.push(text);
    }

    return pages.join("\n").trim();
  } catch (err) {
    console.error("PDF extraction error:", err);
    return "";
  }
}

import { getCurrentUser } from "./auth";
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
  authors: string;
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
  let cutAt = clean.length;
  for (const re of SECTION_BOUNDARIES) {
    const m = clean.match(re);
    if (m && m.index !== undefined && m.index > 0 && m.index < cutAt) {
      cutAt = m.index;
    }
  }
  const core = clean.slice(0, Math.min(cutAt, EMBEDDING_CORE_CHARS)).trim();

  return core.length >= 40 ? core : title.trim();
}
async function embedJournalText(text: string): Promise<number[] | null> {
  try {
    const { pipeline } = await import("@xenova/transformers");
    const pipe = (await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    )) as any;
    const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 8_000);
    const result = await pipe(cleaned, { pooling: "mean", normalize: true });
    return Array.from(result.data) as number[];
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
  return {
    success: true,
    data: {
      id: row.id as string,
      title: (row.title as string) || "Untitled",
      authors: (row.authors as string) || null,
      year: (row.year as string) || null,
      fileUrl: (row.file_url as string) || "",
      hasText: !!((row.extracted_text as string) || "").trim(),
    },
  };
}
export async function getAllJournals(): Promise<
  JournalActionResult<Journal[]>
> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "department") {
    return { success: false, error: "Only department accounts can view journals." };
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
export async function logJournalExtractCost(input: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  journalTitle?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();

  const aiCost = (input.promptTokens / 1_000_000) * 0.14 +
                 (input.completionTokens / 1_000_000) * 1.10;
  const totalCost = Math.round(aiCost * 1e8) / 1e8;

  await supabase.from("analysis_cost_logs").insert({
    user_id: user.id,
    title: input.journalTitle || "Journal metadata extraction",
    source: "journal",
    ai_provider: "opencode-go",
    ai_model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    ai_input_tokens: input.promptTokens,
    ai_output_tokens: input.completionTokens,
    ai_cost: totalCost,
    total_cost: totalCost,
  });
}
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
    const filePath = (journal as any).file_url.replace(/^.*\/journals\
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