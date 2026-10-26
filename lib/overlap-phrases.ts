import { isStopWord, tokenize } from "@/lib/nlp";
import {
  classifyPhraseQuality,
  isInstitutionalPhrase,
} from "@/lib/boilerplate";

export type SectionKey = "obj" | "subj" | "meth" | "full";

export type SectionExplanation = {
  score: number;
  level: "strong" | "moderate" | "weak" | "none";
  why: string;
  /** Short topical / institutional n-grams for chips (not truncated citations). */
  sharedPhrases: string[];
  /** Full example sentence from the matched work, when available. */
  exampleSentence?: string;
};

const SECTION_LABEL: Record<SectionKey, string> = {
  obj: "objectives",
  subj: "subject / topic",
  meth: "methodology",
  full: "overall wording",
};

function levelFromScore(score: number): SectionExplanation["level"] {
  if (score >= 45) return "strong";
  if (score >= 25) return "moderate";
  if (score >= 10) return "weak";
  return "none";
}

/** Extract multi-word phrases (3–6 tokens) that appear in both texts. */
export function extractSharedPhrases(
  textA: string,
  textB: string,
  max = 8,
): string[] {
  const a = textA.toLowerCase().replace(/\s+/g, " ");
  const b = textB.toLowerCase().replace(/\s+/g, " ");
  if (!a.trim() || !b.trim()) return [];

  const tokensA = tokenize(a);
  const found = new Set<string>();

  for (let n = 6; n >= 3; n--) {
    for (let i = 0; i + n <= tokensA.length; i++) {
      const slice = tokensA.slice(i, i + n);
      const content = slice.filter((t) => !isStopWord(t));
      if (content.length < 2) continue;
      const phrase = slice.join(" ");
      if (phrase.length < 12) continue;
      if (b.includes(phrase)) found.add(phrase);
      if (found.size >= max * 2) break;
    }
    if (found.size >= max * 2) break;
  }

  // Prefer longer topical phrases; drop institutional / contained hits.
  const sorted = [...found].sort((a, b) => {
    const aInst = isInstitutionalPhrase(a) ? 1 : 0;
    const bInst = isInstitutionalPhrase(b) ? 1 : 0;
    if (aInst !== bInst) return aInst - bInst;
    return b.length - a.length;
  });
  const kept: string[] = [];
  for (const p of sorted) {
    if (kept.some((k) => k.includes(p))) continue;
    kept.push(p);
    if (kept.length >= max) break;
  }
  return kept;
}

/** Finish a phrase that was stored truncated against a known full title. */
export function completePhraseAgainstTitle(
  phrase: string,
  matchTitle?: string,
): string {
  const p = (phrase || "").replace(/\s+/g, " ").trim();
  const t = (matchTitle || "").replace(/\s+/g, " ").trim();
  if (!p) return p;
  if (!t) return p;
  const pl = p.toLowerCase();
  const tl = t.toLowerCase();
  // Stored mid-title truncation (e.g. ends before full title)
  if (tl.startsWith(pl) && t.length > p.length) return t;
  // Title + author/venue stub ("… Higher Education AK Singh… - International Journal…")
  if (pl.startsWith(tl)) {
    const rest = p.slice(t.length).trim();
    if (!rest) return t;
    const looksLikeCitationTail =
      rest.length <= 48 ||
      /^[A-Z]{1,4}(\s|,)/.test(rest) ||
      /\s-\s/.test(rest) ||
      /international journal/i.test(rest) ||
      /\.\.\./.test(rest) ||
      /et al/i.test(rest);
    if (looksLikeCitationTail && !/[.!?]$/.test(rest)) return t;
  }
  return p;
}

/** Heal quoted spans inside a why-string using the match title. */
export function healWhyAgainstTitle(why: string, matchTitle?: string): string {
  if (!why || !matchTitle) return why;
  return why.replace(/[“"]([^”"]{8,})[”"]/g, (full, inner: string) => {
    const fixed = completePhraseAgainstTitle(inner, matchTitle);
    if (fixed === inner) return full;
    const open = full.startsWith("“") ? "“" : '"';
    const close = full.endsWith("”") ? "”" : '"';
    return `${open}${fixed}${close}`;
  });
}

/** Pull sentences from candidate that share content tokens with the TAF section. */
export function extractSharedSentences(
  tafSection: string,
  candidateText: string,
  max = 3,
): string[] {
  const tafTokens = new Set(
    tokenize(tafSection).filter((t) => !isStopWord(t) && t.length >= 4),
  );
  if (tafTokens.size === 0) return [];

  const sentences = candidateText
    .replace(/\s+/g, " ")
    // Also break Scholar-style "Title Authors - Journal" blobs
    .split(/(?<=[.!?])\s+| \u2013 | — | - (?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24 && s.length <= 500);

  const scored = sentences
    .map((s) => {
      const toks = tokenize(s).filter((t) => !isStopWord(t) && t.length >= 4);
      const hits = toks.filter((t) => tafTokens.has(t));
      const uniq = new Set(hits);
      return { s, score: uniq.size };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score);

  const out: string[] = [];
  for (const { s } of scored) {
    if (out.some((o) => o.slice(0, 40) === s.slice(0, 40))) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function buildSectionExplanation(
  key: SectionKey,
  score: number,
  tafSection: string,
  candidateText: string,
  weakTopicalOverlap: boolean,
): SectionExplanation {
  const rawPhrases = extractSharedPhrases(tafSection, candidateText, 8);
  const topicalPhrases = rawPhrases.filter((p) => !isInstitutionalPhrase(p));
  const institutionalPhrases = rawPhrases.filter((p) => isInstitutionalPhrase(p));
  const sharedPhrases =
    topicalPhrases.length > 0
      ? topicalPhrases.slice(0, 5)
      : institutionalPhrases.slice(0, 3);
  const sharedSentences = extractSharedSentences(tafSection, candidateText, 2).filter(
    (s) => !isInstitutionalPhrase(s.slice(0, 80)),
  );
  const level = weakTopicalOverlap && (key === "obj" || key === "subj")
    ? "none"
    : levelFromScore(score);
  const label = SECTION_LABEL[key];
  const cite = topicalPhrases.length > 0 ? topicalPhrases : sharedPhrases;

  let why: string;
  if (level === "none" || score < 5) {
    why = `Little overlap in ${label}. This section does not support treating the works as the same study.`;
  } else if (topicalPhrases.length === 0 && institutionalPhrases.length > 0) {
    why = `Overlap in ${label} is mostly campus/template wording (e.g. “${institutionalPhrases[0]}”), not a shared research problem.`;
  } else if (level === "weak") {
    why = `Only light relatedness in ${label}${
      cite.length ? ` (shared wording like “${cite[0]}”)` : ""
    }. Likely shared academic language rather than the same research aim.`;
  } else if (level === "moderate") {
    why = `Moderate overlap in ${label}${
      cite.length
        ? `: related phrases include “${cite.slice(0, 2).join('”, “')}”`
        : ""
    }. Related direction, but not necessarily the same study.`;
  } else {
    why = `Strong overlap in ${label}${
      cite.length
        ? ` — shared concepts such as “${cite.slice(0, 2).join('”, “')}”`
        : ""
    }. This section pulls the match toward the same research neighborhood.`;
  }

  const exampleSentence =
    sharedSentences[0] && level !== "none" && topicalPhrases.length > 0
      ? sharedSentences[0]
      : undefined;

  if (exampleSentence) {
    why += ` Example from the matched work: “${exampleSentence}”`;
  }

  // Chips stay short topical/institutional n-grams only — never sliced citation blobs.
  const chipPhrases = [
    ...sharedPhrases.filter((p) => p.length <= 100),
    ...institutionalPhrases.slice(0, 2).filter((p) => p.length <= 100),
  ].filter((p, i, arr) => arr.indexOf(p) === i);

  return {
    score,
    level,
    why,
    sharedPhrases: chipPhrases,
    exampleSentence,
  };
}

export function buildMatchOverlapEvidence(args: {
  tafAspects: { obj: string; subj: string; meth: string; full: string };
  candidateText: string;
  aspects: { obj: number; subj: number; meth: number; full: number };
  weakTopicalOverlap: boolean;
}): {
  sectionExplanations: Record<SectionKey, SectionExplanation>;
  highlightPhrases: string[];
  phraseQuality: "topical" | "institutional_only" | "none";
} {
  const keys: SectionKey[] = ["obj", "subj", "meth", "full"];
  const sectionExplanations = {} as Record<SectionKey, SectionExplanation>;
  const highlightSet = new Set<string>();

  for (const key of keys) {
    const expl = buildSectionExplanation(
      key,
      args.aspects[key],
      args.tafAspects[key],
      args.candidateText,
      args.weakTopicalOverlap,
    );
    sectionExplanations[key] = expl;
    for (const p of expl.sharedPhrases) {
      if (p.length >= 8) highlightSet.add(p);
    }
  }

  for (const p of extractSharedPhrases(
    args.tafAspects.full,
    args.candidateText,
    10,
  )) {
    highlightSet.add(p);
  }

  const all = [...highlightSet];
  const topical = all
    .filter((p) => !isInstitutionalPhrase(p))
    .sort((a, b) => b.length - a.length);
  const institutional = all
    .filter((p) => isInstitutionalPhrase(p))
    .sort((a, b) => b.length - a.length);
  const highlightPhrases = [...topical, ...institutional].slice(0, 12);
  const phraseQuality = classifyPhraseQuality(highlightPhrases);

  return { sectionExplanations, highlightPhrases, phraseQuality };
}

/** Escape regex special chars for phrase highlighting. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
