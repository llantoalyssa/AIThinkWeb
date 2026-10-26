/** Institutional / template wording that inflates campus co-occurrence. */
export const INSTITUTIONAL_PHRASES: string[] = [
  "batangas state university",
  "the national engineering university",
  "bsu-malvar",
  "bsu malvar",
  "jplpc-malvar",
  "jplpc malvar",
  "batstateu",
  "batstate-u",
  "bat state u",
  "tneu",
  "cics department",
  "cics",
  "g.batstate-u.edu.ph",
  "batstate-u.edu.ph",
  "web-based system",
  "web based system",
  "for the department",
  "for the cics",
  "capstone project",
  "undergraduate thesis",
  "college of informatics",
  "computing sciences",
];

/** Tokens treated as institutional for keyword filtering. */
const INSTITUTIONAL_TOKEN_RE =
  /\b(batangas|batstateu?|bsu|malvar|jplpc|tneu|cics|capstone|department)\b/i;

/** Admin / campus-information-system journal signals. */
export const ADMIN_JOURNAL_KEYWORDS: string[] = [
  "tracer",
  "alumni",
  "payroll",
  "syllabus",
  "attendance monitoring",
  "faculty evaluation",
  "answer sheet",
  "grading",
  "graduate tracer",
  "personal data sheet",
  "resume",
  "appointment scheduling",
  "mental health assessment",
  "digital path",
  "document management",
  "records management",
  "enrollment",
  "inventory",
];

/** Student-risk / learning-analytics TAF signals. */
export const RISK_ANALYTICS_TAF_KEYWORDS: string[] = [
  "risk",
  "early warning",
  "adviser",
  "advisory",
  "lms",
  "learning management",
  "dropout",
  "at-risk",
  "at risk",
  "academic vulnerability",
  "xai",
  "shap",
  "counterfactual",
  "feature attribution",
  "student risk",
  "learning analytics",
  "predictive",
  "explainable",
];

/** Domain terms that count as topical (not campus) overlap. */
export const TOPICAL_DOMAIN_TERMS: string[] = [
  "risk",
  "adviser",
  "advisory",
  "lms",
  "dropout",
  "prediction",
  "predictive",
  "student academic",
  "early warning",
  "learning analytics",
  "feature attribution",
  "shap",
  "counterfactual",
  "explainable",
  "intervention",
  "engagement",
  "at-risk",
  "vulnerability",
  "classification",
  "longitudinal",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove institutional boilerplate spans from text (for Stage-2 embedding). */
export function stripBoilerplate(text: string): string {
  let out = (text || "").replace(/\s+/g, " ").trim();
  if (!out) return out;
  const sorted = [...INSTITUTIONAL_PHRASES].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    out = out.replace(new RegExp(escapeRegExp(p), "gi"), " ");
  }
  out = out.replace(/\b[\w.+-]+@g\.batstate-u\.edu\.ph\b/gi, " ");
  return out.replace(/\s+/g, " ").trim();
}

export function isInstitutionalPhrase(phrase: string): boolean {
  const p = (phrase || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!p) return true;
  if (INSTITUTIONAL_PHRASES.some((inst) => p.includes(inst) || inst.includes(p))) {
    return true;
  }
  // Phrase is mostly institutional tokens
  const tokens = p.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return true;
  const instHits = tokens.filter((t) => INSTITUTIONAL_TOKEN_RE.test(t)).length;
  return instHits / tokens.length >= 0.5 && !hasTopicalToken(p);
}

function hasTopicalToken(text: string): boolean {
  const lower = text.toLowerCase();
  return TOPICAL_DOMAIN_TERMS.some((t) => lower.includes(t));
}

/** True if any phrase contains a topical domain term. */
export function hasTopicalSharedPhrases(phrases: string[]): boolean {
  return (phrases || []).some((p) => hasTopicalToken(p) && !isInstitutionalPhrase(p));
}

export function classifyPhraseQuality(
  phrases: string[],
): "topical" | "institutional_only" | "none" {
  const list = (phrases || []).map((p) => p.trim()).filter(Boolean);
  if (list.length === 0) return "none";
  if (hasTopicalSharedPhrases(list)) return "topical";
  return "institutional_only";
}

export function isInstitutionalKeywordToken(token: string): boolean {
  return INSTITUTIONAL_TOKEN_RE.test(token);
}

export function textHasAnyKeyword(text: string, keywords: string[]): boolean {
  const lower = (text || "").toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function isAdminSystemJournal(titleAndBody: string): boolean {
  return textHasAnyKeyword(titleAndBody, ADMIN_JOURNAL_KEYWORDS);
}

export function isRiskAnalyticsTaf(titleAndObjectives: string): boolean {
  return textHasAnyKeyword(titleAndObjectives, RISK_ANALYTICS_TAF_KEYWORDS);
}

/** Soft Scholar anchors when education/risk signals are present. */
export function scholarDomainAnchors(titleAndObjectives: string): string[] {
  const t = (titleAndObjectives || "").toLowerCase();
  const anchors: string[] = [];
  if (
    /risk|dropout|early warning|adviser|advisory|lms|learning analytics|student academic/.test(
      t,
    )
  ) {
    anchors.push("learning analytics", "higher education");
  } else if (/education|student|curriculum|capstone/.test(t)) {
    anchors.push("higher education");
  }
  return anchors.slice(0, 2);
}
