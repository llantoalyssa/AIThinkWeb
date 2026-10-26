"use client";
import type { ScoringBreakdown, ScoringSide } from "@/server/actions/analyze-taf";
import {
  ASPECT_WEIGHT_FULL,
  ASPECT_WEIGHT_METH,
  ASPECT_WEIGHT_OBJ,
  ASPECT_WEIGHT_SUBJ,
  EXTERNAL_WEIGHT,
  INTERNAL_WEIGHT,
} from "@/lib/constants";
import AspectScoreBreakdown from "@/components/aspect-score-breakdown";
function ScoringSideTable({
  heading,
  side,
  accent,
  noiseFloor,
  overallJudgment,
}: {
  heading: string;
  side: ScoringSide;
  accent: string;
  noiseFloor: number;
  overallJudgment?: "high_similarity" | "low_similarity";
}) {
  if (side.steps.length === 0) {
    return (
      <div>
        <p className={`text-xs font-semibold mb-1.5 ${accent}`}>{heading}</p>
        <p className="text-xs text-gray-400">
          No matches found — this side contributes 0.
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className={`text-xs font-semibold mb-1.5 ${accent}`}>{heading}</p>
      <p className="text-[10px] text-gray-400 mb-1.5">
        Noise floor {noiseFloor}% · Raw = Stage-1 cosine · Calibrated = Stage-2
        section points (obj {(ASPECT_WEIGHT_OBJ * 100).toFixed(0)}% + subj{" "}
        {(ASPECT_WEIGHT_SUBJ * 100).toFixed(0)}% + meth{" "}
        {(ASPECT_WEIGHT_METH * 100).toFixed(0)}% + overall{" "}
        {(ASPECT_WEIGHT_FULL * 100).toFixed(0)}%)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[11px]">
        <thead className="text-gray-400">
          <tr>
            <th className="text-left font-medium pb-1">Match</th>
            <th className="text-right font-medium pb-1">Raw cosine</th>
            <th className="text-right font-medium pb-1">Calibrated</th>
            <th className="text-right font-medium pb-1">Rank wt</th>
            <th className="text-right font-medium pb-1">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {side.steps.map((s) => (
            <tr key={s.rank} className="border-t border-gray-100">
              <td className="py-1 text-gray-500 align-top">
                <span className="font-medium text-gray-600">#{s.rank}</span>{" "}
                <span
                  className="inline-block max-w-[140px] truncate align-bottom text-gray-400"
                  title={s.label}
                >
                  {s.label}
                </span>
                {(s.weakTopicalOverlap || s.campusNeighborOnly) && (
                  <span className="ml-1 text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded">
                    {s.campusNeighborOnly ? "campus" : "weak"}
                  </span>
                )}
              </td>
              <td className="py-1 text-right text-gray-500 align-top">
                {s.raw.toFixed(2)}%
              </td>
              <td className="py-1 text-right font-medium text-[#333] align-top">
                {s.reduced.toFixed(2)}%
              </td>
              <td className="py-1 text-right text-gray-500 align-top">
                {(s.weight * 100).toFixed(2)}%
              </td>
              <td className="py-1 text-right font-semibold text-[#333] align-top">
                {s.contribution.toFixed(2)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-gray-200 bg-gray-50">
            <td colSpan={4} className="py-1 pr-2 text-right font-medium text-gray-600">
              Aggregate
            </td>
            <td className="py-1 text-right font-bold text-[#333]">
              {side.aggregate.toFixed(2)}%
            </td>
          </tr>
        </tbody>
        </table>
      </div>
      <div className="mt-2 space-y-2 max-h-72 overflow-y-auto pr-1">
        {side.steps.map((s) => (
          <div key={`aspect-${s.rank}`} className="rounded border border-gray-100 p-1.5">
            <p className="text-[10px] font-medium text-gray-600 truncate px-1" title={s.label}>
              #{s.rank} {s.label}
            </p>
            <AspectScoreBreakdown
              aspects={s.aspects}
              matchScore={s.reduced}
              weakTopicalOverlap={s.weakTopicalOverlap}
              campusNeighborOnly={s.campusNeighborOnly}
              phraseQuality={s.phraseQuality}
              sectionExplanations={s.sectionExplanations}
              overallJudgment={overallJudgment}
              matchTitle={s.label}
              compact
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScoringBreakdownCard({
  breakdown,
  overallJudgment,
}: {
  breakdown: ScoringBreakdown;
  overallJudgment?: "high_similarity" | "low_similarity";
}) {
  const internalFloor =
    breakdown.internalNoiseFloor ?? breakdown.noiseFloor ?? 28;
  const externalFloor =
    breakdown.externalNoiseFloor ?? breakdown.noiseFloor ?? 22;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-3 py-2">
        <p className="text-xs font-semibold text-gray-600">
          Complete Calculation
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Aspect calibration: raw cosine ≤ floor counts as 0; above that{" "}
          <span className="font-mono">
            (raw − floor) / (100 − floor) × 100
          </span>
          . Internal floor {internalFloor}% · External floor {externalFloor}%.
          Calibrated % is topical relatedness, not percent of matching text.
        </p>
      </div>
      <div className="p-3 space-y-3">
        <ScoringSideTable
          heading="1. Internal matches — department journals"
          side={breakdown.internal}
          accent="text-blue-700"
          noiseFloor={internalFloor}
          overallJudgment={overallJudgment ?? breakdown.judgment}
        />
        <ScoringSideTable
          heading="2. External matches — Google Scholar"
          side={breakdown.external}
          accent="text-purple-700"
          noiseFloor={externalFloor}
          overallJudgment={overallJudgment ?? breakdown.judgment}
        />

        <div className="rounded-lg bg-gray-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-gray-600">
            3. Combine ({(INTERNAL_WEIGHT * 100).toFixed(0)}% internal +{" "}
            {(EXTERNAL_WEIGHT * 100).toFixed(0)}% external)
          </p>
          <p className="font-mono text-[11px] text-[#444]">
            ({breakdown.internalWeight.toFixed(2)} ×{" "}
            {breakdown.internal.aggregate.toFixed(2)}) + (
            {breakdown.externalWeight.toFixed(2)} ×{" "}
            {breakdown.external.aggregate.toFixed(2)}) ={" "}
            {breakdown.internalTerm.toFixed(2)} +{" "}
            {breakdown.externalTerm.toFixed(2)} ={" "}
            <span className="font-bold text-[#333]">
              {breakdown.combined.toFixed(2)}%
            </span>
          </p>
          <p
            className={`text-[11px] font-medium ${
              breakdown.judgment === "high_similarity"
                ? "text-red-600"
                : "text-green-600"
            }`}
          >
            4. Verdict: {breakdown.combined.toFixed(2)}%{" "}
            {breakdown.combined >= breakdown.threshold ? "≥" : "<"}{" "}
            {breakdown.threshold}% threshold →{" "}
            {breakdown.judgment === "high_similarity"
              ? "High Similarity"
              : "Low Similarity"}
          </p>
        </div>
      </div>
    </div>
  );
}
