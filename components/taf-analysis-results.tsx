"use client";

import { useState } from "react";
import type {
  TAFAnalysisResult,
  AnalysisVersion,
  InternalMatchDisplay,
  ExternalMatchDisplay,
} from "@/server/actions/analyze-taf";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  INTERNAL_WEIGHT,
  EXTERNAL_WEIGHT,
} from "@/lib/constants";
import JournalViewerButton from "@/components/journal-viewer-button";
import ScoringBreakdownCard from "@/components/scoring-breakdown-card";
import {
  BookOpen,
  Target,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  BrainCircuit,
  BarChart3,
  Search,
  Globe,
  Library,
  Sparkles,
  ChevronRight,
  Lightbulb,
} from "lucide-react";

type Props = {
  analysis: TAFAnalysisResult;
  versions?: AnalysisVersion[];
  activeVersion?: number;
  onSelectVersion?: (version: number) => void;
  onReanalyze?: () => void;

  reanalyzeDisabled?: boolean;
  reanalyzeDisabledReason?: string;
};

export default function TAFAnalysisResults({
  analysis,
  versions = [],
  activeVersion,
  onSelectVersion,
  onReanalyze,
  reanalyzeDisabled = false,
  reanalyzeDisabledReason,
}: Props) {
  const {
    combinedScore,
    internalScore,
    externalScore,
    judgment,
    versionNumber,
    internalMatches,
    externalMatches,
    sdgCategories,
    fieldOfIt,
    researchGapAnalysis,
    recommendations,
    similarityReduction,
    scoringBreakdown,
    analyzedAt,
  } = analysis;

  const isHigh = judgment === "high_similarity";
  const formattedDate = new Date(analyzedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6 mt-8">
      {}
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-[#8B1A1A]" />
        <h2 className="text-lg font-bold text-[#333]">TAF Analysis Report</h2>
        <span className="text-xs text-gray-400 ml-auto">
          Analyzed {formattedDate}
        </span>
      </div>
      <Separator />

      {}
      {versions.length > 1 && (
        <div className="flex items-start gap-2 flex-wrap">
          {versions.map((v) => {
            const isActive = (activeVersion ?? versionNumber) === v.versionNumber;
            const vHigh = v.judgment === "high_similarity";
            return (
              <button
                key={v.versionNumber}
                type="button"
                onClick={() => onSelectVersion?.(v.versionNumber)}
                className={`inline-flex flex-col items-start gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#8B1A1A]/10 text-[#8B1A1A] border border-[#8B1A1A]/30 shadow-sm"
                    : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
                }`}
                title={`V${v.versionNumber}: Combined ${v.combinedScore.toFixed(1)}% · Internal ${v.internalScore.toFixed(2)}% · External ${v.externalScore.toFixed(2)}%`}
              >
                <span className="flex items-center gap-1.5">
                  V{v.versionNumber}
                  <span
                    className={`text-[10px] font-bold ${
                      vHigh ? "text-red-500" : "text-green-500"
                    }`}
                  >
                    {v.combinedScore.toFixed(1)}%
                  </span>
                  {vHigh ? (
                    <AlertTriangle className="h-3 w-3 text-red-400" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 text-green-400" />
                  )}
                </span>
                {}
                <span className="flex items-center gap-2 text-[9px] font-normal text-gray-500">
                  <span className="text-blue-600">Int {v.internalScore.toFixed(2)}</span>
                  <span className="text-purple-600">Ext {v.externalScore.toFixed(2)}</span>
                </span>
              </button>
            );
          })}

          {
}
          {judgment === "high_similarity" && (
            <div className="ml-auto pt-1">
              <button
                type="button"
                onClick={onReanalyze}
                disabled={reanalyzeDisabled}
                title={reanalyzeDisabled ? reanalyzeDisabledReason : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-50"
              >
                <BrainCircuit className="h-3.5 w-3.5" />
                Re-analyze
              </button>
            </div>
          )}
        </div>
      )}

      {}
      {versions.length <= 1 && onReanalyze && judgment === "high_similarity" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReanalyze}
            disabled={reanalyzeDisabled}
            title={reanalyzeDisabled ? reanalyzeDisabledReason : undefined}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-50"
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            Re-analyze
          </button>
        </div>
      )}

      {}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {}
        <Card className="lg:col-span-2 overflow-hidden border-t-4 border-t-[#8B1A1A] shadow-md">
          <CardContent className="p-6 sm:p-8">
            {}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#8B1A1A]/10">
                <Search className="h-4 w-4 text-[#8B1A1A]" />
              </div>
              <span className="text-xs font-semibold text-[#8B1A1A] uppercase tracking-wider">
                Detection
              </span>
              <span className="text-[11px] text-gray-400 ml-1 font-mono">
                V{versionNumber}
              </span>
              <div
                className={`ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  isHigh
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-green-50 text-green-700 border border-green-200"
                }`}
              >
                {isHigh ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {isHigh ? "High Similarity" : "Low Similarity"}
              </div>
            </div>

            {}
            <div className="flex items-baseline gap-3 mb-4">
              <span
                className={`text-6xl font-extrabold tracking-tight ${
                  isHigh ? "text-red-600" : "text-green-600"
                }`}
              >
                {combinedScore.toFixed(1)}%
              </span>
              <span className="text-sm text-gray-400 font-medium">
                Combined Score
              </span>
            </div>

            {}
            <div
              className={`rounded-lg p-4 mb-5 border ${
                isHigh
                  ? "bg-red-50 border-red-200"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  isHigh ? "text-red-800" : "text-green-800"
                }`}
              >
                <span className="font-bold">
                  {isHigh ? "Attention" : "Notice"}
                </span>
                : {combinedScore.toFixed(1)}% of your content matches existing
                capstone studies in our database.
              </p>
              <p
                className={`text-xs mt-1 ${
                  isHigh ? "text-red-600" : "text-green-600"
                }`}
              >
                {isHigh
                  ? "This may require revisions to ensure originality."
                  : "Your submission appears sufficiently original."}
              </p>
            </div>

            {}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[#8B1A1A] hover:bg-[#a02020] transition-colors cursor-pointer"
                >
                  View More
                  <ChevronRight className="h-4 w-4" />
                </button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4 text-[#8B1A1A]" />
                    Detailed Scoring
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center p-3 rounded-lg bg-gray-50">
                      <div className="text-2xl font-bold text-[#333]">
                        {combinedScore.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">Combined</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-blue-50">
                      <div className="text-xl font-bold text-blue-700">
                        {internalScore.toFixed(2)}%
                      </div>
                      <div className="text-xs text-blue-600 mt-0.5">
                        Internal ({(INTERNAL_WEIGHT * 100).toFixed(0)}%)
                      </div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-purple-50">
                      <div className="text-xl font-bold text-purple-700">
                        {externalScore.toFixed(2)}%
                      </div>
                      <div className="text-xs text-purple-600 mt-0.5">
                        External ({(EXTERNAL_WEIGHT * 100).toFixed(0)}%)
                      </div>
                    </div>
                    <div
                      className={`text-center p-3 rounded-lg flex flex-col items-center justify-center ${
                        isHigh ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                      }`}
                    >
                      {isHigh ? (
                        <AlertTriangle className="h-5 w-5 mb-0.5" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 mb-0.5" />
                      )}
                      <span className="font-semibold text-xs">
                        {isHigh ? "High Similarity" : "Low Similarity"}
                      </span>
                      <span className="text-[10px] opacity-80 mt-0.5">
                        {isHigh ? "≥ 25% — May need revisions" : "< 25% — Sufficiently original"}
                      </span>
                    </div>
                  </div>

                  {

}
                  {scoringBreakdown && (
                    <ScoringBreakdownCard breakdown={scoringBreakdown} />
                  )}

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 font-medium mb-1">
                      Scoring Formula
                    </p>
                    <p className="text-sm text-[#444]">
                      Combined = (internal aggregate ×{" "}
                      {INTERNAL_WEIGHT.toFixed(2)}) + (external aggregate ×{" "}
                      {EXTERNAL_WEIGHT.toFixed(2)})
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Each side = its top-5 matches, noise-reduced, then weighted
                      Top1 40% / Top2 25% / Top3 15% / Top4 12% / Top5 8%
                      (renormalized when fewer than 5 exist) — SBERT embeddings.
                    </p>
                    <p className="text-xs text-gray-400">
                      Internal: department journals · External: Google Scholar
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {}
        <Card className="overflow-hidden shadow-md">
          <CardHeader className="pb-3 bg-gray-50 border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-[#8B1A1A]" />
              Classification & Domain
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">
                SDG Categories
              </span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sdgCategories.length > 0 ? (
                  sdgCategories.map((sdg, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-xs font-medium"
                    >
                      {sdg}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-400 italic">Not classified</span>
                )}
              </div>
            </div>
            <Separator />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">
                Field of IT
              </span>
              <p className="text-sm font-medium text-[#333] mt-1.5">
                {fieldOfIt || "Not classified"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {}
      {internalMatches.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Library className="h-4 w-4 text-[#8B1A1A]" />
              Top {internalMatches.length} Internal Matches
              <span className="text-xs font-normal text-gray-400 ml-1">
                (Journals)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {internalMatches.map((match, i) => (
                <InternalMatchRow key={match.journalId ?? match.tafId} match={match} rank={i + 1} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-purple-600" />
            Top {externalMatches.length || 0} External Matches
            <span className="text-xs font-normal text-gray-400 ml-1">
              (Google Scholar)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {externalMatches.length > 0 ? (
            <div className="space-y-4">
              {externalMatches.map((match, i) => (
                <ExternalMatchRow key={i} match={match} rank={i + 1} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              {analysis.externalSearchConfigured
                ? "No external matches found for this topic. Try refining your proposed title or background."
                : "External search is not configured. Add a SERPAPI_API_KEY to enable Google Scholar matching."}
            </p>
          )}
        </CardContent>
      </Card>

      {}
      {similarityReduction && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <Lightbulb className="h-5 w-5 text-amber-600" />
              How to Lower Your Similarity Score
            </CardTitle>
            <p className="text-xs text-amber-700/80">
              The score reflects <strong>topic similarity, not word choice</strong> —
              so paraphrasing barely changes it. To genuinely lower the score, shift
              the research dimension itself.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {similarityReduction.topMatchTitle && (
              <p className="text-sm text-amber-900">
                <span className="font-semibold">Top match driving the score:</span>{" "}
                {similarityReduction.topMatchTitle}
              </p>
            )}
            {similarityReduction.driver && (
              <p className="text-sm text-amber-900 leading-relaxed">
                <span className="font-semibold">Why it&apos;s still similar:</span>{" "}
                {similarityReduction.driver}
              </p>
            )}
            {similarityReduction.suggestions?.length > 0 && (
              <ul className="space-y-2 mt-1">
                {similarityReduction.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {}
      {analysis.enhancement?.changeSummary && (
        <Card className="border-t-4 border-t-amber-500 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              What was Improved
            </CardTitle>
            <p className="text-xs text-gray-400">
              Your TAF content has been updated with these improvements based
              on the matched journals and external papers. Use the change icon
              on each field to compare before and after.
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm text-amber-800 leading-relaxed">
                {analysis.enhancement.changeSummary}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-[#8B1A1A]" />
            Research Gap Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            if (!researchGapAnalysis) {
              console.warn("[taf-analysis] researchGapAnalysis is empty — real value:", researchGapAnalysis);
            }
            const gapText =
              researchGapAnalysis ||
              "No research gap analysis detected. You may concern this to your capstone adviser or instructor.";
            return (
              <p className="text-sm text-[#444] leading-relaxed whitespace-pre-line">
                {gapText}
              </p>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
function InternalMatchRow({
  match,
  rank,
}: {
  match: InternalMatchDisplay;
  rank: number;
}) {
  const pct = match.similarityPercent;
  const barColor =
    pct >= 50 ? "bg-red-500" : pct >= 25 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#333] truncate">
            {match.title || match.proposedTitle}
          </p>
          {match.year && (
            <span className="shrink-0 text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
              {match.year}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          {match.authors || match.studentName || "Journal"}
        </p>
        <div className="mt-1.5 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <JournalViewerButton journalId={match.journalId} />
        <span className="text-sm font-bold text-[#333]">{pct.toFixed(2)}%</span>
      </div>
    </div>
  );
}

function ExternalMatchRow({
  match,
  rank,
}: {
  match: ExternalMatchDisplay;
  rank: number;
}) {
  const pct = match.similarityPercent;
  const citeStr = [match.authors, `"${match.title}"`, match.publication, match.year ? `(${match.year})` : ""]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-b-0 last:pb-0">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-600">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#444] leading-relaxed italic">{citeStr}.</p>
        <div className="flex items-center justify-between mt-1.5">
          {match.link ? (
            <a
              href={match.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="h-3 w-3" />
              View source
            </a>
          ) : (
            <span />
          )}
          <span className="text-xs font-semibold text-purple-700">{pct.toFixed(2)}% similar</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-purple-400 transition-all duration-500"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}