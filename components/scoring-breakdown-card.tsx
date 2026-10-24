"use client";
import type { ScoringBreakdown, ScoringSide } from "@/server/actions/analyze-taf";
import { EXTERNAL_WEIGHT, INTERNAL_WEIGHT } from "@/lib/constants";
function ScoringSideTable({
  heading,
  side,
  accent,
}: {
  heading: string;
  side: ScoringSide;
  accent: string;
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[11px]">
        <thead className="text-gray-400">
          <tr>
            <th className="text-left font-medium pb-1">Match</th>
            <th className="text-right font-medium pb-1">Raw</th>
            <th className="text-right font-medium pb-1">After floor</th>
            <th className="text-right font-medium pb-1">Weight</th>
            <th className="text-right font-medium pb-1">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {side.steps.map((s) => (
            <tr key={s.rank} className="border-t border-gray-100">
              <td className="py-1 text-gray-500">
                <span className="font-medium text-gray-600">#{s.rank}</span>{" "}
                <span
                  className="inline-block max-w-[150px] truncate align-bottom text-gray-400"
                  title={s.label}
                >
                  {s.label}
                </span>
              </td>
              <td className="py-1 text-right text-gray-500">
                {s.raw.toFixed(2)}%
              </td>
              <td className="py-1 text-right font-medium text-[#333]">
                {s.reduced.toFixed(2)}%
              </td>
              <td className="py-1 text-right text-gray-500">
                {(s.weight * 100).toFixed(2)}%
              </td>
              <td className="py-1 text-right font-semibold text-[#333]">
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
    </div>
  );
}

export default function ScoringBreakdownCard({
  breakdown,
}: {
  breakdown: ScoringBreakdown;
}) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-3 py-2">
        <p className="text-xs font-semibold text-gray-600">
          Complete Calculation
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Noise floor: a raw match ≤ {breakdown.noiseFloor}% counts as 0; above
          that the range is rescaled —{" "}
          <span className="font-mono">
            (raw − {breakdown.noiseFloor}) / {100 - breakdown.noiseFloor} × 100
          </span>
        </p>
      </div>
      <div className="p-3 space-y-3">
        <ScoringSideTable
          heading="1. Internal matches — department journals"
          side={breakdown.internal}
          accent="text-blue-700"
        />
        <ScoringSideTable
          heading="2. External matches — Google Scholar"
          side={breakdown.external}
          accent="text-purple-700"
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