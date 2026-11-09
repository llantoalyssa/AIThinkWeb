"use client";

import { useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AnalysisExecution,
  AnalysisNextAction,
  EvidenceReviewRecord,
  EvidenceReviewStatus,
} from "@/server/analysis/evidence-review";
import { requiredChecksCompleted } from "@/server/analysis/evidence-review";

const ACTION_LABELS: Record<AnalysisNextAction, string> = {
  eligible_for_submission: "Eligible for adviser submission",
  revision_required: "Revision required",
  adviser_review_required: "Manual adviser review required",
  analysis_incomplete: "Analysis incomplete",
};

const ASSESSMENT_LABELS = {
  no_additional_concern: "No additional concern in supplied evidence",
  supports_high_similarity: "Evidence supports the high-similarity signal",
  potential_false_positive: "Potential SBERT false positive",
  potential_missed_overlap: "Potential overlap not reflected by the score",
  insufficient_evidence: "Insufficient evidence",
} as const;

type Props = {
  status: EvidenceReviewStatus;
  record: EvidenceReviewRecord | null;
  execution: AnalysisExecution | null;
  nextAction: AnalysisNextAction;
  onRetry?: () => Promise<void>;
};

export default function EvidenceReviewCard({
  status,
  record,
  execution,
  nextAction,
  onRetry,
}: Props) {
  const [retrying, setRetrying] = useState(false);
  const review = record?.review;
  const canRetry =
    !!onRetry &&
    !!execution &&
    requiredChecksCompleted(execution) &&
    (status === "unavailable" || status === "invalid");
  const actionIsPositive = nextAction === "eligible_for_submission";

  async function retry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Card className="border-t-4 border-t-indigo-500 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5 text-indigo-600" />
              AI Evidence Review
            </CardTitle>
            <p className="mt-1 text-xs text-gray-500">
              A bounded review of supplied passages, not a comprehensive originality check.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              actionIsPositive
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {actionIsPositive ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {ACTION_LABELS[nextAction]}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "not_reviewed" && (
          <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            Not reviewed. This analysis predates the AI evidence-review step.
          </p>
        )}

        {record?.failure && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Evidence review unavailable</p>
            <p className="mt-1">{record.failure.message}</p>
          </div>
        )}

        {review && (
          <>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                {ASSESSMENT_LABELS[review.assessment]}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gray-800">{review.summary}</p>
            </div>

            {review.findings.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-900">Verified findings</h4>
                {review.findings.map((finding, index) => {
                  const source = record.sources.find((item) => item.id === finding.sourceId);
                  return (
                    <div key={`${finding.sourceId}-${index}`} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900">
                          {source?.title || finding.sourceId}
                        </span>
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                          {finding.aspect.replaceAll("_", " ")}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <blockquote className="rounded bg-blue-50 p-2 text-xs leading-relaxed text-blue-900">
                          <strong>TAF:</strong> “{finding.tafExcerpt}”
                        </blockquote>
                        <blockquote className="rounded bg-purple-50 p-2 text-xs leading-relaxed text-purple-900">
                          <strong>Source:</strong> “{finding.sourceExcerpt}”
                        </blockquote>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-gray-700">{finding.explanation}</p>
                      {source?.link && (
                        <a
                          href={source.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
                        >
                          Open source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {review.recommendations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Recommendations</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {review.recommendations.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            )}

            {review.limitations.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Limitations</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
                  {review.limitations.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            )}
          </>
        )}

        {execution && nextAction === "analysis_incomplete" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            Required comparison did not complete. Internal: {execution.internal.retrieval}/{execution.internal.scoring}; external: {execution.external.retrieval}/{execution.external.scoring}.
          </div>
        )}

        {record?.sources.some((source) => source.limitation) && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500">
            {[...new Set(record.sources.map((source) => source.limitation).filter(Boolean))].map(
              (limitation) => <li key={limitation}>{limitation}</li>,
            )}
          </ul>
        )}

        {canRetry && (
          <Button type="button" variant="outline" size="sm" onClick={retry} disabled={retrying}>
            {retrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry AI evidence review
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
