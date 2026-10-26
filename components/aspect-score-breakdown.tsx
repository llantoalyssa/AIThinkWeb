"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  ASPECT_GATE_FLOOR,
  ASPECT_WEIGHT_FULL,
  ASPECT_WEIGHT_METH,
  ASPECT_WEIGHT_OBJ,
  ASPECT_WEIGHT_SUBJ,
  ASPECT_WEAK_SCORE_CAP,
  HIGH_SIMILARITY_THRESHOLD,
} from "@/lib/constants";
import {
  hasTopicalSharedPhrases,
  isInstitutionalPhrase,
} from "@/lib/boilerplate";
import {
  completePhraseAgainstTitle,
  healWhyAgainstTitle,
} from "@/lib/overlap-phrases";
import type { SectionExplanationDisplay } from "@/server/actions/analyze-taf";

export type AspectScores = {
  obj: number;
  subj: number;
  meth: number;
  full: number;
};

const ASPECT_ROWS: {
  key: keyof AspectScores;
  label: string;
  weight: number;
  hint: string;
}[] = [
  {
    key: "obj",
    label: "Objectives",
    weight: ASPECT_WEIGHT_OBJ,
    hint: "Research aims / what the study tries to do",
  },
  {
    key: "subj",
    label: "Subject / topic",
    weight: ASPECT_WEIGHT_SUBJ,
    hint: "Problem domain, population, subject matter",
  },
  {
    key: "meth",
    label: "Methodology",
    weight: ASPECT_WEIGHT_METH,
    hint: "How the study is designed and carried out",
  },
  {
    key: "full",
    label: "Overall text",
    weight: ASPECT_WEIGHT_FULL,
    hint: "Whole-document topical pull (lighter weight)",
  },
];

function barColor(pct: number): string {
  if (pct >= 50) return "bg-red-500";
  if (pct >= ASPECT_GATE_FLOOR) return "bg-amber-500";
  return "bg-green-500";
}

function levelBadge(level?: SectionExplanationDisplay["level"]) {
  switch (level) {
    case "strong":
      return "bg-red-50 text-red-700 border-red-200";
    case "moderate":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "weak":
      return "bg-yellow-50 text-yellow-800 border-yellow-200";
    default:
      return "bg-green-50 text-green-700 border-green-200";
  }
}

function topicalVerdict(args: {
  matchScore: number;
  aspects?: AspectScores;
  weakTopicalOverlap?: boolean;
  campusNeighborOnly?: boolean;
  phraseQuality?: "topical" | "institutional_only" | "none";
  sharedPhrases: string[];
  overallJudgment?: "high_similarity" | "low_similarity";
}): { label: string; className: string; detail: string } {
  const obj = args.aspects?.obj ?? 0;
  const subj = args.aspects?.subj ?? 0;
  const topicalPhrases = hasTopicalSharedPhrases(args.sharedPhrases);
  const overallLow = args.overallJudgment === "low_similarity";

  if (args.campusNeighborOnly || args.weakTopicalOverlap) {
    return {
      label: args.campusNeighborOnly
        ? "Nearest campus neighbor"
        : "Not the same study",
      className: "bg-green-50 text-green-800 border-green-200",
      detail: args.campusNeighborOnly
        ? "Campus/admin system neighbor — not the same research problem. Shared institutional wording may inflate raw similarity."
        : "Objectives and subject both scored below the gate — shared wording only, not a true peer.",
    };
  }

  const canBeSameNeighborhood =
    obj >= 25 &&
    subj >= 25 &&
    topicalPhrases &&
    args.matchScore >= HIGH_SIMILARITY_THRESHOLD &&
    !overallLow;

  if (canBeSameNeighborhood) {
    return {
      label: "Likely same research neighborhood",
      className: "bg-red-50 text-red-800 border-red-200",
      detail:
        "Objectives and subject are both strong with topical shared phrases. Expand for section-by-section evidence.",
    };
  }

  if (args.matchScore >= HIGH_SIMILARITY_THRESHOLD || args.matchScore >= ASPECT_GATE_FLOOR) {
    if (overallLow) {
      return {
        label:
          args.phraseQuality === "institutional_only"
            ? "Nearest campus neighbor"
            : "Partially related",
        className: "bg-amber-50 text-amber-900 border-amber-200",
        detail:
          "High among retrieved neighbors, but overall Low Similarity — not treated as the same study.",
      };
    }
    if (!topicalPhrases && args.matchScore >= HIGH_SIMILARITY_THRESHOLD) {
      return {
        label: "Nearest campus neighbor",
        className: "bg-amber-50 text-amber-900 border-amber-200",
        detail:
          "Score looks elevated but shared phrases are mostly campus/template wording, not domain overlap.",
      };
    }
    return {
      label: "Partially related",
      className: "bg-amber-50 text-amber-900 border-amber-200",
      detail:
        "Some overlap in topic or method. Expand to see which sections drove the score and why.",
    };
  }

  return {
    label: "Not the same study",
    className: "bg-green-50 text-green-800 border-green-200",
    detail: "Low topical relatedness across the weighted sections.",
  };
}

export default function AspectScoreBreakdown({
  aspects,
  matchScore,
  weakTopicalOverlap,
  campusNeighborOnly,
  phraseQuality,
  sectionExplanations,
  overallJudgment,
  matchTitle,
  compact = false,
  defaultOpen = false,
}: {
  aspects?: AspectScores;
  matchScore: number;
  weakTopicalOverlap?: boolean;
  campusNeighborOnly?: boolean;
  phraseQuality?: "topical" | "institutional_only" | "none";
  sectionExplanations?: Record<
    "obj" | "subj" | "meth" | "full",
    SectionExplanationDisplay
  >;
  overallJudgment?: "high_similarity" | "low_similarity";
  /** Used to complete phrases that were stored truncated mid-title/author. */
  matchTitle?: string;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!aspects) {
    return (
      <p className="text-[11px] text-gray-400 italic mt-2">
        Section breakdown available after re-analysis with the updated scoring.
      </p>
    );
  }

  const rows = ASPECT_ROWS.map((r) => {
    const score = aspects[r.key];
    const points = score * r.weight;
    const expl = sectionExplanations?.[r.key];
    return { ...r, score, points, expl };
  });
  const fused = rows.reduce((s, r) => s + r.points, 0);
  const gated = !!weakTopicalOverlap;
  const allPhrases = rows.flatMap((r) => r.expl?.sharedPhrases ?? []);
  const topicalChips = allPhrases.filter((p) => !isInstitutionalPhrase(p));
  const institutionalChips = allPhrases.filter((p) => isInstitutionalPhrase(p));
  const effectiveQuality =
    phraseQuality ??
    (topicalChips.length > 0
      ? "topical"
      : institutionalChips.length > 0
        ? "institutional_only"
        : "none");

  const verdict = topicalVerdict({
    matchScore,
    aspects,
    weakTopicalOverlap,
    campusNeighborOnly,
    phraseQuality: effectiveQuality,
    sharedPhrases: allPhrases,
    overallJudgment,
  });
  const phraseCount = allPhrases.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-gray-400 shrink-0">
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold text-gray-700">
                Why related — section details
              </p>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${verdict.className}`}
              >
                {verdict.label}
              </span>
              <span className="text-[10px] font-bold tabular-nums text-[#333] ml-auto">
                {matchScore.toFixed(2)}%
              </span>
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              {verdict.detail}
            </p>
            {!open && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {rows.map((r) => (
                  <span
                    key={r.key}
                    className="inline-flex items-center gap-1 text-[9px] text-gray-600 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5"
                  >
                    <span className="font-medium">{r.label}</span>
                    <span className="tabular-nums font-semibold">
                      {r.score.toFixed(0)}%
                    </span>
                  </span>
                ))}
                <span className="text-[9px] text-[#8B1A1A] font-medium px-1 py-0.5">
                  Show full explanations
                  {phraseCount > 0 ? ` · ${phraseCount} phrases` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className={`border-t border-gray-100 ${compact ? "p-2.5" : "p-3"}`}>
          {(effectiveQuality === "institutional_only" ||
            effectiveQuality === "none") && (
            <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2">
              <p className="text-[10px] font-medium text-amber-900">
                No strong topical phrases found — similarity may be campus
                wording only.
              </p>
            </div>
          )}

          <p className="text-[10px] text-gray-500 mb-2 leading-relaxed">
            Points = section score × weight. Match score = sum of points
            {gated
              ? ` (capped at ${ASPECT_WEAK_SCORE_CAP}% because objectives & subject were both weak / domain-gated).`
              : "."}
          </p>

          <div className="space-y-2">
            {rows.map((r) => (
              <SectionDetailRow
                key={r.key}
                label={r.label}
                weight={r.weight}
                hint={r.hint}
                score={r.score}
                points={r.points}
                expl={r.expl}
                matchTitle={matchTitle}
                showHint={!compact}
              />
            ))}
          </div>

          {institutionalChips.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-[9px] font-semibold text-gray-500 mb-1">
                Campus / template wording (de-emphasized)
              </p>
              <ul className="flex flex-wrap gap-1">
                {institutionalChips.slice(0, 6).map((p) => (
                  <li
                    key={p}
                    className="text-[9px] bg-gray-100 text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 max-w-full break-words whitespace-normal"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2.5 pt-2 border-t border-gray-100 space-y-1">
            <p className="text-[11px] font-mono text-gray-600">
              {rows.map((r) => r.points.toFixed(2)).join(" + ")} ={" "}
              <span className="font-semibold">{fused.toFixed(2)}</span>
              {gated ? (
                <>
                  {" "}
                  → capped{" "}
                  <span className="font-semibold text-amber-800">
                    {matchScore.toFixed(2)}%
                  </span>
                </>
              ) : (
                <>
                  {" "}
                  →{" "}
                  <span className="font-semibold text-[#333]">
                    {matchScore.toFixed(2)}%
                  </span>
                </>
              )}
            </p>
            <p className="text-[9px] text-gray-400">
              Weights: Objectives {(ASPECT_WEIGHT_OBJ * 100).toFixed(0)}% ·
              Subject {(ASPECT_WEIGHT_SUBJ * 100).toFixed(0)}% · Method{" "}
              {(ASPECT_WEIGHT_METH * 100).toFixed(0)}% · Overall{" "}
              {(ASPECT_WEIGHT_FULL * 100).toFixed(0)}%. Gate: obj &amp; subj both
              &lt; {ASPECT_GATE_FLOOR}% ⇒ weak / not same study.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionDetailRow({
  label,
  weight,
  hint,
  score,
  points,
  expl,
  matchTitle,
  showHint,
}: {
  label: string;
  weight: number;
  hint: string;
  score: number;
  points: number;
  expl?: SectionExplanationDisplay;
  matchTitle?: string;
  showHint: boolean;
}) {
  const [sectionOpen, setSectionOpen] = useState(
    () => expl?.level === "strong" || expl?.level === "moderate",
  );
  const completedPhrases = (expl?.sharedPhrases ?? []).map((p) =>
    completePhraseAgainstTitle(p, matchTitle),
  );
  const topical = completedPhrases
    .filter((p) => !isInstitutionalPhrase(p))
    .filter((p, i, arr) => arr.indexOf(p) === i);
  const institutional = completedPhrases
    .filter((p) => isInstitutionalPhrase(p))
    .filter((p, i, arr) => arr.indexOf(p) === i);
  const whyText = healWhyAgainstTitle(expl?.why || "", matchTitle);
  const example = completePhraseAgainstTitle(
    expl?.exampleSentence || "",
    matchTitle,
  );

  return (
    <div className="rounded border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="w-full text-left px-2 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
        aria-expanded={sectionOpen}
      >
        <div className="flex items-center gap-1.5 text-[11px]">
          {sectionOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          )}
          <span className="font-medium text-gray-700">
            {label}{" "}
            <span className="font-normal text-gray-400">
              (×{(weight * 100).toFixed(0)}%)
            </span>
          </span>
          {expl && (
            <span
              className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${levelBadge(
                expl.level,
              )}`}
            >
              {expl.level}
            </span>
          )}
          <span className="tabular-nums text-gray-600 ml-auto shrink-0">
            {score.toFixed(1)}% →{" "}
            <span className="font-semibold text-[#333]">
              {points.toFixed(2)} pts
            </span>
          </span>
        </div>
        <div className="ml-5 mt-1 h-1.5 w-[calc(100%-1.25rem)] rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor(score)}`}
            style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
          />
        </div>
      </button>

      {sectionOpen && (
        <div className="px-2.5 pb-2.5 pt-1 ml-5 space-y-1.5 border-t border-gray-50">
          {showHint && <p className="text-[9px] text-gray-400">{hint}</p>}
          {expl ? (
            <>
              <p className="text-[10px] text-gray-600 leading-relaxed break-words whitespace-normal">
                <span className="font-semibold text-gray-700">Why: </span>
                {whyText}
              </p>
              {example && (
                <p className="text-[10px] text-gray-700 leading-relaxed break-words whitespace-normal rounded border border-amber-100 bg-amber-50/60 px-2 py-1.5">
                  <span className="font-semibold text-amber-900">
                    Example from matched work:{" "}
                  </span>
                  “{example}”
                </p>
              )}
              {topical.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-amber-900 mb-1">
                    Related topical phrases
                  </p>
                  <ul className="flex flex-col gap-1">
                    {topical.map((p) => (
                      <li
                        key={p}
                        className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 rounded px-2 py-1 break-words whitespace-normal"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {institutional.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-gray-500 mb-1">
                    Campus / template wording
                  </p>
                  <ul className="flex flex-col gap-1">
                    {institutional.map((p) => (
                      <li
                        key={p}
                        className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded px-2 py-1 break-words whitespace-normal"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-[10px] text-gray-400 italic">
              No stored explanation — re-analyze to generate why-related
              details.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
