"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";
import { findTopSimilarByVector, embedText } from "@/server/analysis/similarity";
import { searchGoogleScholar } from "@/server/analysis/external-search";
import {
  analyzeWithAI,
  type AIVerdict,
  analysisRatePerToken,
  resolveAnalysisModel,
  resolveAnalysisProvider,
} from "@/server/analysis/ai-analysis";
import { htmlToPlainText, plainTextToHtml } from "@/lib/html";
import {
  HIGH_SIMILARITY_THRESHOLD,
  INTERNAL_WEIGHT,
  EXTERNAL_WEIGHT,
  NOISE_FLOOR,
  RANK_WEIGHTS,
  noiseReduce,
  rankWeightsFor,
} from "@/lib/constants";
import { extractKeywords, DEFAULT_SEARCH_QUERY } from "@/lib/nlp";
function aggregateSimilarityByRank(similarities: number[]): number {
  if (similarities.length === 0) return 0;
  const weights = rankWeightsFor(similarities.length);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += similarities[i] * weights[i];
  }
  return acc;
}
export type ScoringStep = {
  rank: number;
  label: string;

  raw: number;

  reduced: number;

  weight: number;

  contribution: number;
};

export type ScoringSide = {
  steps: ScoringStep[];
  aggregate: number;
};
export type ScoringBreakdown = {
  noiseFloor: number;
  rankWeights: number[];
  internal: ScoringSide;
  external: ScoringSide;
  internalWeight: number;
  externalWeight: number;
  internalTerm: number;
  externalTerm: number;
  combined: number;
  threshold: number;
  judgment: "high_similarity" | "low_similarity";
};

function buildScoringSide(
  matches: { label: string; raw: number; reduced: number }[],
): ScoringSide {
  const weights = rankWeightsFor(matches.length);
  const steps: ScoringStep[] = matches.map((m, i) => ({
    rank: i + 1,
    label: m.label,
    raw: m.raw,
    reduced: m.reduced,
    weight: weights[i] ?? 0,
    contribution: m.reduced * (weights[i] ?? 0),
  }));
  return {
    steps,
    aggregate: steps.reduce((sum, s) => sum + s.contribution, 0),
  };
}
const round2 = (n: number): number => Math.round(n * 100) / 100;
const MIN_FIELD_CHARS_DEFAULT = 1000;
const MIN_FIELD_CHARS_BY_LABEL: Record<string, number> = {
  "Reference List": 500,
};
const minFieldCharsFor = (label: string): number =>
  MIN_FIELD_CHARS_BY_LABEL[label] ?? MIN_FIELD_CHARS_DEFAULT;
export type TAFAnalysisResult = {
  id: string;
  tafId: string;
  versionNumber: number;
  internalScore: number;
  externalScore: number;
  combinedScore: number;
  judgment: "high_similarity" | "low_similarity";
  internalMatches: InternalMatchDisplay[];
  externalMatches: ExternalMatchDisplay[];

  externalSearchConfigured: boolean;
  sdgCategories: string[];
  fieldOfIt: string;
  researchGapAnalysis: string;
  recommendations: { titleSuggestions: string[]; backgroundSuggestions: string[] };

  enhancement: TAFEnhancement | null;

  similarityReduction: {
    driver: string;
    topMatchTitle: string;
    suggestions: string[];
  } | null;
  formFieldsSnapshot: FormFieldsSnapshot | null;
  scoringBreakdown: ScoringBreakdown | null;
  analyzedAt: string;
};

export type TAFEnhancement = {
  improvedTitle: string;
  improvedBackground: string;
  improvedObjectives: string;
  improvedMethodology: string;
  improvedLiteratureReview: string;
  improvedReferences: string;
  changeSummary: string;
};

export type FormFieldsSnapshot = {
  proposedTitle: string;
  background: string;
  objectives: string;
  literatureReview: string;
  methodology: string;
  referenceList: string;
};

export type AnalysisVersion = {
  versionNumber: number;
  combinedScore: number;
  judgment: "high_similarity" | "low_similarity";
  analyzedAt: string;

  internalScore: number;

  externalScore: number;
};
export type InternalMatchDisplay = {
  journalId: string;
  title: string;
  authors: string;
  year: number | null;
  similarityPercent: number;

  tafId?: string;
  studentName?: string;
  proposedTitle?: string;
};

export type ExternalMatchDisplay = {
  title: string;
  authors: string;
  publication: string;
  year: number | null;
  link: string;
  similarityPercent: number;
};

export type AnalyzeTAFResult =
  | { success: true; data: TAFAnalysisResult }
  | { success: false; step: string; error: string };
type TAFRow = {
  id: string;
  student_id: string;
  proposed_title: string;
  background: string;
  objectives: string;
  literature_review: string;
  methodology: string;
  reference_list: string;
  created_at: string;
  student_name?: string;
};

type AnalysisDbRow = Record<string, unknown>;
type JournalRow = {
  id: string;
  title: string;
  authors: string | null;
  year: string | null;
  extracted_text: string | null;
  embedding_text: string | null;
  embedding: unknown;
};
export async function analyzeTAF(tafId: string): Promise<AnalyzeTAFResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, step: "auth", error: "You must be logged in." };
  }
  if (user.role !== "student") {
    return { success: false, step: "auth", error: "Only students can analyze TAFs." };
  }

  const supabase = await createClient();
  const { data: taf, error: tafErr } = await supabase
    .from("topic_abstract_forms")
    .select("*")
    .eq("id", tafId)
    .eq("student_id", user.id)
    .single();

  if (tafErr || !taf) {
    return { success: false, step: "load_taf", error: "TAF not found or you don't have access." };
  }
  const rawContent = buildComparisonText(taf as unknown as TAFRow);
  const significant = rawContent.replace(/\s+/g, " ").trim();
  if (significant.length < 25) {
    return {
      success: false,
      step: "validate",
      error:
        "Your Topic Abstract is too short to analyze. Please add more content to your title, background, and objectives.",
    };
  }
  const requiredFields: Array<{ label: string; value: string | null }> = [
    { label: "Proposed Title", value: taf.proposed_title },
    { label: "Background of the Proposed Topic", value: htmlToPlainText(taf.background || "") },
    { label: "Objectives", value: htmlToPlainText(taf.objectives || "") },
    { label: "Review of Related Literature", value: htmlToPlainText(taf.literature_review || "") },
    { label: "Methodology", value: htmlToPlainText(taf.methodology || "") },
    { label: "Reference List", value: htmlToPlainText(taf.reference_list || "") },
  ];
  const emptyField = requiredFields.find((f) => !f.value || !f.value.trim());
  if (emptyField) {
    return {
      success: false,
      step: "validate",
      error: `${emptyField.label} is empty. All fields must be filled in before analysis.`,
    };
  }
  const shortFields = requiredFields
    .filter((f) => f.label !== "Proposed Title")
    .map((f) => ({
      label: f.label,
      length: (f.value || "").trim().length,
      min: minFieldCharsFor(f.label),
    }))
    .filter((f) => f.length < f.min);
  if (shortFields.length > 0) {
    const detail = shortFields
      .map((f) => `${f.label} (${f.length}/${f.min})`)
      .join(", ");
    return {
      success: false,
      step: "validate",
      error: `Some fields are still below the minimum length. Still short: ${detail}`,
    };
  }

  const myText = rawContent;
  const { data: existingVersions } = await supabase
    .from("taf_analysis_results")
    .select("version_number")
    .eq("taf_id", tafId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = existingVersions && existingVersions.length > 0
    ? (existingVersions[0].version_number as number) + 1
    : 1;
  const MAX_ANALYSIS_VERSIONS = 5;
  if (nextVersion > MAX_ANALYSIS_VERSIONS) {
    return {
      success: false,
      step: "version_limit",
      error: `You have reached the maximum of ${MAX_ANALYSIS_VERSIONS} analyses for this TAF. Further re-analysis is no longer allowed.`,
    };
  }
  const rawQueryForSearch = htmlToPlainText(
    taf.proposed_title || (taf.background as string)?.slice(0, 500) || "",
  );
  const keywords = extractKeywords(rawQueryForSearch, 6, 3);
  const externalSearchQuery = keywords.join(" ") || DEFAULT_SEARCH_QUERY;
  const externalSearchPromise = searchGoogleScholar(externalSearchQuery, 10);

  const recencyCutoffYear = getRecencyCutoffYear();
  const { data: journals, error: journalsErr } = await supabase
    .from("journals")
    .select("id, title, authors, year, extracted_text, embedding_text, embedding")
    .order("created_at", { ascending: false });

  if (journalsErr) {
    console.error("[analyzeTAF] Failed to fetch journals:", journalsErr);
  }

  let internalResults: { id: string; similarity: number; meta?: Record<string, unknown> }[] = [];
  let journalVectorCandidates: { id: string; vector: number[]; meta?: Record<string, unknown> }[] = [];

  const allJournals = (journals || []) as unknown as JournalRow[];

  if (allJournals.length > 0) {
    for (const j of allJournals) {
      const vec = parsePgVector(j.embedding);
      if (!vec || vec.length === 0) continue;
      const journalYear = j.year ? parseInt(String(j.year)) : NaN;
      if (Number.isNaN(journalYear)) {

      } else if (journalYear < recencyCutoffYear) {
        continue;
      }

      journalVectorCandidates.push({
        id: j.id,
        vector: vec,
        meta: {
          journalTitle: j.title || "Untitled",
          journalAuthors: j.authors || "",
          year: journalYear,
          excerpt: (j.embedding_text || j.extracted_text || "")
            .replace(/\s+/g, " ")
            .slice(0, 500),
        },
      });
    }

    try {
      const queryVec = await embedText(myText);
      internalResults = await findTopSimilarByVector(queryVec, journalVectorCandidates, 5);
    } catch (embedErr) {
      console.error("[analyzeTAF] Journal embedding comparison failed:", embedErr);
    }
  }
  const internalRawPercents = internalResults.map((r) => r.similarity);
  internalResults = internalResults.map((r) => ({
    ...r,
    similarity: noiseReduce(r.similarity),
  }));
  const internalScore = aggregateSimilarityByRank(
    internalResults.map((r) => r.similarity),
  );

  const internalMatches: InternalMatchDisplay[] = internalResults.map((r) => ({
    journalId: r.id,
    title: (r.meta?.journalTitle as string) || "Untitled",
    authors: (r.meta?.journalAuthors as string) || "",
    year: (r.meta?.year as number) || null,
    similarityPercent: r.similarity,
  }));
  const externalSearchResult = await externalSearchPromise;

  if (!externalSearchResult.success) {
    console.error("[analyzeTAF] External search failed:", externalSearchResult.error);
  }
  let externalScore = 0;

  const externalRawPercents: number[] = [];
  const externalMatches: ExternalMatchDisplay[] = [];

  if (externalSearchResult.success && externalSearchResult.results.length > 0) {
    const recentExternal = externalSearchResult.results.filter((r) => {
      const y = r.year ? parseInt(String(r.year)) : NaN;
      return !Number.isNaN(y) && y >= recencyCutoffYear;
    });

    const externalCandidates = recentExternal.map((r) => ({
      id: r.link || r.title,
      text: `${r.title} ${r.summary}`,
      meta: {
        title: r.title,
        authors: r.authors,
        publication: r.publication,
        year: r.year,
        link: r.link,
      },
    }));
    const { findTopSimilar } = await import("@/server/analysis/similarity");
    const externalScored = await findTopSimilar(myText, externalCandidates, 5);
    for (const r of externalScored) externalRawPercents.push(r.similarity);
    const externalSimResults = externalScored.map((r) => ({
      ...r,
      similarity: noiseReduce(r.similarity),
    }));

    for (const r of externalSimResults) {
      externalMatches.push({
        title: (r.meta?.title as string) || "",
        authors: (r.meta?.authors as string) || "",
        publication: (r.meta?.publication as string) || "",
        year: (r.meta?.year as number) || null,
        link: (r.meta?.link as string) || "",
        similarityPercent: r.similarity,
      });
    }
    externalScore = aggregateSimilarityByRank(
      externalSimResults.map((r) => r.similarity),
    );
  }
  const combinedScore =
    INTERNAL_WEIGHT * internalScore + EXTERNAL_WEIGHT * externalScore;
  const judgment: "high_similarity" | "low_similarity" =
    combinedScore >= HIGH_SIMILARITY_THRESHOLD ? "high_similarity" : "low_similarity";
  const scoringBreakdown: ScoringBreakdown = {
    noiseFloor: NOISE_FLOOR,
    rankWeights: RANK_WEIGHTS,
    internal: buildScoringSide(
      internalMatches.map((m, i) => ({
        label: m.title,
        raw: internalRawPercents[i] ?? 0,
        reduced: m.similarityPercent,
      })),
    ),
    external: buildScoringSide(
      externalMatches.map((m, i) => ({
        label: m.title,
        raw: externalRawPercents[i] ?? 0,
        reduced: m.similarityPercent,
      })),
    ),
    internalWeight: INTERNAL_WEIGHT,
    externalWeight: EXTERNAL_WEIGHT,
    internalTerm: INTERNAL_WEIGHT * internalScore,
    externalTerm: EXTERNAL_WEIGHT * externalScore,
    combined: combinedScore,
    threshold: HIGH_SIMILARITY_THRESHOLD,
    judgment,
  };
  const aiVerdict: AIVerdict = await analyzeWithAI(
    {
      proposedTitle: taf.proposed_title || "",
      background: taf.background || "",
      objectives: taf.objectives || "",
      literatureReview: taf.literature_review || "",
      methodology: taf.methodology || "",
    },
    internalMatches.slice(0, 3).map((m) => ({
      title: m.title,
      similarity: m.similarityPercent,
      excerpt: internalResults.find((r) => r.id === m.journalId)?.meta?.excerpt as
        | string
        | undefined,
    })),
    externalMatches.slice(0, 3).map((m) => ({
      title: m.title,
      similarity: m.similarityPercent,
      snippet: m.publication,
    })),
  );
  const isLowSimilarityRun = judgment === "low_similarity";
  if (isLowSimilarityRun) {
    aiVerdict.enhancement = undefined;
    aiVerdict.recommendations = {
      titleSuggestions: [],
      backgroundSuggestions: [],
    };
    aiVerdict.similarityReduction = undefined;
  }
  const aiInputTokens = aiVerdict.usage?.promptTokens || 0;
  const aiOutputTokens = aiVerdict.usage?.completionTokens || 0;
  const aiRates = analysisRatePerToken();
  const aiCost = aiInputTokens * aiRates.input + aiOutputTokens * aiRates.output;

  const SERPAPI_PER_CALL = 0.01;
  const serpapiCost = externalSearchResult.success ? SERPAPI_PER_CALL : 0;
  const originalSnapshot: FormFieldsSnapshot = {
    proposedTitle: taf.proposed_title || "",
    background: taf.background || "",
    objectives: taf.objectives || "",
    literatureReview: taf.literature_review || "",
    methodology: taf.methodology || "",
    referenceList: taf.reference_list || "",
  };
  const enhancement = aiVerdict.enhancement ?? null;
  const now = new Date().toISOString();

  const { error: insertErr } = await supabase
    .from("taf_analysis_results")
    .insert({
      taf_id: tafId,
      version_number: nextVersion,
      internal_similarity_score: round2(internalScore),
      external_similarity_score: round2(externalScore),
      combined_score: round2(combinedScore),
      judgment,
      scoring_breakdown: JSON.parse(JSON.stringify(scoringBreakdown)),
      internal_matches: JSON.parse(JSON.stringify(internalMatches)),
      external_matches: JSON.parse(JSON.stringify(externalMatches)),
      sdg_categories: aiVerdict.sdgCategories,
      field_of_it: aiVerdict.fieldOfIt,
      research_gap_analysis: aiVerdict.researchGapAnalysis,
      recommendations: JSON.parse(JSON.stringify(aiVerdict.recommendations)),
      form_fields_snapshot: JSON.parse(JSON.stringify(originalSnapshot)),
      enhancement: enhancement
        ? JSON.parse(JSON.stringify(enhancement))
        : null,
      similarity_reduction: aiVerdict.similarityReduction
        ? JSON.parse(JSON.stringify(aiVerdict.similarityReduction))
        : null,
      analyzed_at: now,
      analyzed_by: user.id,
    })
    .select()
    .single();

  if (insertErr) {
    console.error("[analyzeTAF] DB insert error:", insertErr);
    return { success: false, step: "store_results", error: "Failed to store analysis results." };
  }
  const applyEnhancement = !!enhancement && judgment === "high_similarity";

  if (applyEnhancement) {
    const { error: updateErr } = await supabase
      .from("topic_abstract_forms")
      .update({
        status: "analyzed",
        proposed_title: enhancement.improvedTitle || taf.proposed_title || "",
        background: plainTextToHtml(enhancement.improvedBackground || taf.background || ""),
        objectives: plainTextToHtml(enhancement.improvedObjectives || taf.objectives || ""),
        methodology: plainTextToHtml(
          enhancement.improvedMethodology || taf.methodology || "",
        ),
        literature_review: plainTextToHtml(
          enhancement.improvedLiteratureReview || taf.literature_review || "",
        ),
        reference_list: plainTextToHtml(
          enhancement.improvedReferences || taf.reference_list || "",
        ),
      })
      .eq("id", tafId)
      .eq("student_id", user.id);

    if (updateErr) {
      console.error("[analyzeTAF] Enhancement update error:", updateErr);
    }
  } else {
    await supabase
      .from("topic_abstract_forms")
      .update({ status: "analyzed" })
      .eq("id", tafId)
      .eq("student_id", user.id);
  }
  const totalCost = aiCost + serpapiCost;
  const isReanalyze = nextVersion > 1;
  await supabase.from("analysis_cost_logs").insert({
    user_id: user.id,
    taf_id: tafId,
    title: (taf as TAFRow).proposed_title || "Untitled",
    version_number: nextVersion,
    source: isReanalyze ? "taf_reanalyze" : "taf_analyze",
    ai_provider: resolveAnalysisProvider(),
    ai_model: resolveAnalysisModel(),
    ai_input_tokens: aiInputTokens,
    ai_output_tokens: aiOutputTokens,
    ai_cost: aiCost,
    serpapi_calls: externalSearchResult.success ? 1 : 0,
    serpapi_cost: serpapiCost,
    total_cost: totalCost,
  });
  return {
    success: true,
    data: {
      id: tafId,
      tafId,
      versionNumber: nextVersion,
      internalScore: round2(internalScore),
      externalScore: round2(externalScore),
      combinedScore: round2(combinedScore),
      judgment,
      scoringBreakdown,
      internalMatches,
      externalMatches,
      externalSearchConfigured: !!process.env.SERPAPI_API_KEY,
      sdgCategories: aiVerdict.sdgCategories,
      fieldOfIt: aiVerdict.fieldOfIt,
      researchGapAnalysis: aiVerdict.researchGapAnalysis,
      recommendations: aiVerdict.recommendations,
      enhancement,
      similarityReduction: aiVerdict.similarityReduction ?? null,
      formFieldsSnapshot: originalSnapshot,
      analyzedAt: now,
    },
  };
}
export async function getTAFAnalysis(
  tafId: string,
  versionNumber?: number,
): Promise<AnalyzeTAFResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, step: "auth", error: "You must be logged in." };
  }

  const supabase = await createClient();

  let query = supabase
    .from("taf_analysis_results")
    .select("*")
    .eq("taf_id", tafId);

  if (versionNumber) {
    query = query.eq("version_number", versionNumber);
  }

  query = query.order("version_number", { ascending: false }).limit(1);

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return { success: false, step: "fetch", error: "Analysis not found." };
  }

  const row = data[0] as AnalysisDbRow;

  return {
    success: true,
    data: {
      id: row.id as string,
      tafId: row.taf_id as string,
      versionNumber: row.version_number as number,
      internalScore: row.internal_similarity_score as number,
      externalScore: row.external_similarity_score as number,
      combinedScore: row.combined_score as number,
      judgment: row.judgment as "high_similarity" | "low_similarity",
      internalMatches: row.internal_matches as unknown as InternalMatchDisplay[],
      externalMatches: row.external_matches as unknown as ExternalMatchDisplay[],
      externalSearchConfigured: !!process.env.SERPAPI_API_KEY,
      sdgCategories: (row.sdg_categories as string[]) || [],
      fieldOfIt: (row.field_of_it as string) || "",
      researchGapAnalysis: (row.research_gap_analysis as string) || "",
      recommendations: row.recommendations as unknown as {
        titleSuggestions: string[];
        backgroundSuggestions: string[];
      },
      enhancement: row.enhancement
        ? (row.enhancement as unknown as TAFEnhancement)
        : null,
      similarityReduction: row.similarity_reduction
        ? (row.similarity_reduction as unknown as {
            driver: string;
            topMatchTitle: string;
            suggestions: string[];
          })
        : null,
      formFieldsSnapshot: row.form_fields_snapshot as unknown as FormFieldsSnapshot | null,
      scoringBreakdown: row.scoring_breakdown
        ? (row.scoring_breakdown as unknown as ScoringBreakdown)
        : null,
      analyzedAt: row.analyzed_at as string,
    },
  };
}
export async function listAnalysisVersions(
  tafId: string,
): Promise<{ success: true; versions: AnalysisVersion[] } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("taf_analysis_results")
    .select("version_number, combined_score, judgment, analyzed_at, internal_similarity_score, external_similarity_score")
    .eq("taf_id", tafId)
    .order("version_number", { ascending: false });

  if (error) {
    return { success: false, error: "Failed to fetch versions." };
  }

  return {
    success: true,
    versions: (data || []).map((r) => ({
      versionNumber: r.version_number as number,
      combinedScore: r.combined_score as number,
      judgment: r.judgment as "high_similarity" | "low_similarity",
      analyzedAt: r.analyzed_at as string,
      internalScore: parseFloat(String(r.internal_similarity_score)) || 0,
      externalScore: parseFloat(String(r.external_similarity_score)) || 0,
    })),
  };
}
export async function discardCancelledAnalysis(
  tafId: string,
  versionNumber: number,
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }
  if (user.role !== "student") {
    return { success: false, error: "Only students can discard analyses." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("discard_taf_analysis", {
    p_taf_id: tafId,
    p_version_number: versionNumber,
  });

  if (error) {
    console.error("[discardCancelledAnalysis] RPC error:", error);
    return { success: false, error: "Failed to discard the cancelled analysis." };
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | { success: boolean; error?: string }
    | null;

  if (!result || result.success !== true) {
    return {
      success: false,
      error: result?.error || "Failed to discard the cancelled analysis.",
    };
  }

  return { success: true };
}
function getRecencyCutoffYear(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  return currentYear - 5;
}

function buildComparisonText(taf: TAFRow): string {
  return [
    taf.proposed_title || "",
    taf.background || "",
    taf.objectives || "",
    taf.methodology || "",
    taf.literature_review || "",
  ]
    .map(htmlToPlainText)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
function parsePgVector(value: unknown): number[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
    const inner = trimmed.slice(1, -1);
    if (!inner.trim()) return [];
    return inner.split(",").map((s) => parseFloat(s.trim()));
  }
  return null;
}