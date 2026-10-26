import { embedText } from "@/server/analysis/similarity";
import {
  ASPECT_GATE_FLOOR,
  ASPECT_WEAK_SCORE_CAP,
  ASPECT_WEIGHT_FULL,
  ASPECT_WEIGHT_METH,
  ASPECT_WEIGHT_OBJ,
  ASPECT_WEIGHT_SUBJ,
  INTERNAL_NOISE_FLOOR,
  EXTERNAL_NOISE_FLOOR,
  noiseReduce,
} from "@/lib/constants";
import {
  buildMatchOverlapEvidence,
  type SectionExplanation,
  type SectionKey,
} from "@/lib/overlap-phrases";
import {
  isAdminSystemJournal,
  isRiskAnalyticsTaf,
  stripBoilerplate,
} from "@/lib/boilerplate";

export type TafAspectTexts = {
  obj: string;
  subj: string;
  meth: string;
  full: string;
};

export type AspectScores = {
  obj: number;
  subj: number;
  meth: number;
  full: number;
};

export type AspectMatchResult = {
  id: string;
  rawCosine: number;
  matchScore: number;
  aspects: AspectScores;
  weakTopicalOverlap: boolean;
  campusNeighborOnly: boolean;
  highlightPhrases: string[];
  sectionExplanations: Record<SectionKey, SectionExplanation>;
  phraseQuality: "topical" | "institutional_only" | "none";
  meta?: Record<string, unknown>;
};

function cosinePct(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.round(dot * 10000) / 100;
}

function clean(text: string, max = 8000): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Build TAF aspect strings for Stage-2 scoring. */
export function buildTafAspectTexts(input: {
  proposedTitle: string;
  background: string;
  objectives: string;
  methodology: string;
  fullText: string;
}): TafAspectTexts {
  const title = clean(input.proposedTitle, 500);
  const obj = clean(`${title} ${input.objectives}`, 4000);
  const subj = clean(`${title} ${input.background}`, 4000);
  const meth = clean(input.methodology || title, 4000);
  const full = clean(
    input.fullText || `${title} ${input.background} ${input.objectives}`,
    8000,
  );
  return { obj, subj, meth, full };
}

export function buildCandidateText(parts: {
  title?: string;
  body?: string;
}): string {
  return clean(`${parts.title || ""} ${parts.body || ""}`.trim() || "untitled", 8000);
}

function fuseAspects(a: AspectScores): number {
  return (
    ASPECT_WEIGHT_OBJ * a.obj +
    ASPECT_WEIGHT_SUBJ * a.subj +
    ASPECT_WEIGHT_METH * a.meth +
    ASPECT_WEIGHT_FULL * a.full
  );
}

function stripAspects(a: TafAspectTexts): TafAspectTexts {
  return {
    obj: stripBoilerplate(a.obj) || a.obj,
    subj: stripBoilerplate(a.subj) || a.subj,
    meth: stripBoilerplate(a.meth) || a.meth,
    full: stripBoilerplate(a.full) || a.full,
  };
}

/**
 * Stage 2: re-score Stage-1 Top-N candidates with aspect embeddings.
 * Journals keep a single upload embedding for retrieval; only Top-N are re-scored.
 */
export async function rescoreCandidatesByAspect(args: {
  tafAspects: TafAspectTexts;
  /** Raw title+objectives for domain detection (before strip). */
  tafDomainText?: string;
  candidates: {
    id: string;
    rawCosine: number;
    text: string;
    meta?: Record<string, unknown>;
  }[];
  corpus: "internal" | "external";
}): Promise<AspectMatchResult[]> {
  const { candidates, corpus } = args;
  if (candidates.length === 0) return [];

  const floor =
    corpus === "internal" ? INTERNAL_NOISE_FLOOR : EXTERNAL_NOISE_FLOOR;

  // Strip institutional boilerplate before Stage-2 embeddings
  const tafAspects = stripAspects(args.tafAspects);
  const strippedCandidates = candidates.map((c) => ({
    ...c,
    embedText: stripBoilerplate(c.text) || c.text,
  }));

  const tafDomainText =
    args.tafDomainText ||
    `${args.tafAspects.obj} ${args.tafAspects.subj}`;
  const tafIsRisk = isRiskAnalyticsTaf(tafDomainText);

  const [objVec, subjVec, methVec, fullVec, ...candVecs] = await Promise.all([
    embedText(tafAspects.obj || " "),
    embedText(tafAspects.subj || " "),
    embedText(tafAspects.meth || " "),
    embedText(tafAspects.full || " "),
    ...strippedCandidates.map((c) => embedText(c.embedText || " ")),
  ]);

  const results: AspectMatchResult[] = candidates.map((c, i) => {
    const cVec = candVecs[i];
    const rawAspects = {
      obj: cosinePct(objVec, cVec),
      subj: cosinePct(subjVec, cVec),
      meth: cosinePct(methVec, cVec),
      full: cosinePct(fullVec, cVec),
    };
    const aspects: AspectScores = {
      obj: noiseReduce(rawAspects.obj, floor),
      subj: noiseReduce(rawAspects.subj, floor),
      meth: noiseReduce(rawAspects.meth, floor),
      full: noiseReduce(rawAspects.full, floor),
    };
    let matchScore = fuseAspects(aspects);
    let weakTopicalOverlap =
      aspects.obj < ASPECT_GATE_FLOOR && aspects.subj < ASPECT_GATE_FLOOR;
    let campusNeighborOnly = false;

    // Internal domain gate: risk/analytics TAF vs admin campus system journal
    if (corpus === "internal" && tafIsRisk && isAdminSystemJournal(c.text)) {
      weakTopicalOverlap = true;
      campusNeighborOnly = true;
      matchScore = Math.min(matchScore, ASPECT_WEAK_SCORE_CAP);
    } else if (weakTopicalOverlap) {
      matchScore = Math.min(matchScore, ASPECT_WEAK_SCORE_CAP);
    }

    const roundedAspects = {
      obj: Math.round(aspects.obj * 100) / 100,
      subj: Math.round(aspects.subj * 100) / 100,
      meth: Math.round(aspects.meth * 100) / 100,
      full: Math.round(aspects.full * 100) / 100,
    };
    const overlap = buildMatchOverlapEvidence({
      tafAspects: args.tafAspects,
      candidateText: c.text,
      aspects: roundedAspects,
      weakTopicalOverlap,
    });
    return {
      id: c.id,
      rawCosine: c.rawCosine,
      matchScore: Math.round(matchScore * 100) / 100,
      aspects: roundedAspects,
      weakTopicalOverlap,
      campusNeighborOnly,
      highlightPhrases: overlap.highlightPhrases,
      sectionExplanations: overlap.sectionExplanations,
      phraseQuality: overlap.phraseQuality,
      meta: c.meta,
    };
  });

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}
