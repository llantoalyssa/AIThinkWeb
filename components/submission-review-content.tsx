"use client";
import { useEffect, useRef, useState } from "react";
import { HIGH_SIMILARITY_THRESHOLD, INTERNAL_WEIGHT, EXTERNAL_WEIGHT } from "@/lib/constants";
import type { SubmissionWithAnalysis } from "@/server/actions/group-submissions";
import ApprovalProgressTracker from "@/components/approval-progress-tracker";
import JournalViewerButton from "@/components/journal-viewer-button";
import ScoringBreakdownCard from "@/components/scoring-breakdown-card";
import AspectScoreBreakdown from "@/components/aspect-score-breakdown";
import AnnotationLayer from "@/components/annotation-layer";
import AnnotatedSection from "@/components/annotated-section";
import AnnotatableRichEditor from "@/components/annotatable-rich-editor";
import ExportTafPdf from "@/components/export-taf-pdf";
import { useAnnotations } from "@/components/annotation-layer";
import {
  updateSubmittedTafContent,
  resubmitTAF,
} from "@/server/actions/approval-workflow";
import type { AnnotationFieldKey } from "@/server/actions/submission-annotations";
import { Button } from "@/components/ui/button";
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
  ArrowLeft,
  BarChart3,
  FileText,
  Search,
  Target,
  Library,
  Globe,
  ExternalLink,
  AlertTriangle,
  CheckCircle2 as CheckCircle2Icon,
  AlertCircle,
  ChevronRight,
  BookOpen,
  Loader2,
  Save,
  RotateCcw,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";

type Props = {
  submission: SubmissionWithAnalysis;

  actions?: React.ReactNode;

  backLabel?: string;
  onBack: () => void;
  editable?: boolean;
  trackerClickable?: boolean;
};

function ToggleCommentMode() {
  const { commentMode, setCommentMode } = useAnnotations();
  return (
    <button
      type="button"
      onClick={() => setCommentMode(!commentMode)}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors cursor-pointer ${
        commentMode
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
      }`}
      title={
        commentMode
          ? "Turn OFF to edit normally (toolbar works)"
          : "Turn ON to annotate by selecting text"
      }
    >
      <MessageSquareText className="h-3.5 w-3.5" />
      {commentMode ? "Comment mode: ON" : "Comment mode: OFF"}
    </button>
  );
}
function AnnotatableTitleField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleJump(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { fieldKey?: string }
        | undefined;
      if (!detail || detail.fieldKey !== "proposedTitle") return;
      const el = ref.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "2px solid #f59e0b";
      setTimeout(() => {
        el.style.outline = "";
      }, 1800);
    }
    window.addEventListener("annotation-jump", handleJump as EventListener);
    return () =>
      window.removeEventListener("annotation-jump", handleJump as EventListener);
  }, []);

  return (
    <div data-annotate="proposedTitle" ref={ref} className="rounded-lg">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
        placeholder="Enter proposed research title"
      />
    </div>
  );
}

export default function SubmissionReviewContent({
  submission,
  actions,
  backLabel = "Back",
  onBack,
  editable = false,
  trackerClickable = true,
}: Props) {
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({
    proposedTitle: submission.tafSnapshot?.proposedTitle || "",
    background: submission.tafSnapshot?.background || "",
    objectives: submission.tafSnapshot?.objectives || "",
    literatureReview: submission.tafSnapshot?.literatureReview || "",
    methodology: submission.tafSnapshot?.methodology || "",
    referenceList: submission.tafSnapshot?.referenceList || "",
  });
  const [saving, setSaving] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);

  const snapshot = submission.tafSnapshot;
  const isHigh =
    submission.judgment === "high_similarity" ||
    submission.combinedScore >= HIGH_SIMILARITY_THRESHOLD;

  function setDraftField(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateSubmittedTafContent(submission.id, {
      proposedTitle: draft.proposedTitle,
      background: draft.background,
      objectives: draft.objectives,
      literatureReview: draft.literatureReview,
      methodology: draft.methodology,
      referenceList: draft.referenceList,
    });
    setSaving(false);
    if (result.success) toast.success(result.message);
    else toast.error(result.error);
  }

  async function handleResubmit() {
    setResubmitting(true);
    const saved = await updateSubmittedTafContent(submission.id, {
      proposedTitle: draft.proposedTitle,
      background: draft.background,
      objectives: draft.objectives,
      literatureReview: draft.literatureReview,
      methodology: draft.methodology,
      referenceList: draft.referenceList,
    });
    if (!saved.success) {
      setResubmitting(false);
      toast.error(saved.error);
      return;
    }
    const result = await resubmitTAF(submission.id);
    setResubmitting(false);
    if (result.success) toast.success(result.message);
    else toast.error(result.error);
  }

  const sections: {
    key: AnnotationFieldKey;
    label: string;
    html: string | null | undefined;
  }[] = [
    {
      key: "background",
      label: "Background of the Proposed Topic",
      html: snapshot?.background,
    },
    {
      key: "objectives",
      label: "General & Specific Objectives",
      html: snapshot?.objectives,
    },
    {
      key: "literatureReview",
      label: "Review of Related Literature",
      html: snapshot?.literatureReview,
    },
    {
      key: "methodology",
      label: "Methodology",
      html: snapshot?.methodology,
    },
    {
      key: "referenceList",
      label: "References",
      html: snapshot?.referenceList,
    },
  ];

  return (
    <AnnotationLayer
      submissionId={submission.id}
      enableCommentMode={!editable}
    >
    <>
      {}
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-gray-600 hover:text-gray-900 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Button>
      </div>

      {}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#8B1A1A]/10 shrink-0">
          <FileText className="h-6 w-6 text-[#8B1A1A]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
            {snapshot?.proposedTitle || "Untitled"}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Submitted by{" "}
            <span className="font-medium text-[#333]">
              {submission.studentName || "Unknown"}
            </span>
            {submission.studentSrCode &&
              submission.studentSrCode !== "—" && (
                <> • {submission.studentSrCode}</>
              )}
            {" on "}
            {new Date(submission.submittedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          {submission.currentApproverRole && (
            <p className="text-xs mt-1 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-indigo-700">
              Currently with:{" "}
              {String(submission.currentApproverRole)
                .replace("_", " ")
                .toUpperCase()}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      {}
      {submission.status === "approved" && (
        <div className="mb-6 flex justify-end">
          <ExportTafPdf submission={submission} />
        </div>
      )}

      {}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2 overflow-hidden border-t-4 border-t-[#8B1A1A] shadow-md">
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#8B1A1A]/10">
                <Search className="h-4 w-4 text-[#8B1A1A]" />
              </div>
              <span className="text-xs font-semibold text-[#8B1A1A] uppercase tracking-wider">
                Detection
              </span>
              <span className="text-[11px] text-gray-400 ml-1 font-mono">
                V{submission.analysisVersion}
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
                  <CheckCircle2Icon className="h-3.5 w-3.5" />
                )}
                {isHigh ? "High Similarity" : "Low Similarity"}
              </div>
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <span
                className={`text-6xl font-extrabold tracking-tight ${
                  isHigh ? "text-red-600" : "text-green-600"
                }`}
              >
                {submission.combinedScore.toFixed(1)}%
              </span>
              <span className="text-sm text-gray-400 font-medium">
                Combined Score
              </span>
            </div>
            <div
              className={`rounded-lg p-4 mb-5 border ${
                isHigh ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  isHigh ? "text-red-800" : "text-green-800"
                }`}
              >
                <span className="font-bold">{isHigh ? "Attention" : "Notice"}</span>
                : estimated topical relatedness to nearest studies is{" "}
                {submission.combinedScore.toFixed(1)}% (not percent of text
                copied).
              </p>
              <p
                className={`text-xs mt-1 ${
                  isHigh ? "text-red-600" : "text-green-600"
                }`}
              >
                {isHigh
                  ? "This may require revisions to ensure originality."
                  : "The submission appears sufficiently original."}
              </p>
            </div>
            <Dialog open={scoreModalOpen} onOpenChange={setScoreModalOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[#8B1A1A] hover:bg-[#a02020] transition-colors cursor-pointer"
                >
                  View More <ChevronRight className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4 text-[#8B1A1A]" /> Detailed
                    Scoring
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center p-3 rounded-lg bg-gray-50">
                      <div className="text-2xl font-bold text-[#333]">
                        {submission.combinedScore.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">Combined</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-blue-50">
                      <div className="text-xl font-bold text-blue-700">
                        {submission.internalSimilarity.toFixed(2)}%
                      </div>
                      <div className="text-xs text-blue-600 mt-0.5">
                        Internal ({(INTERNAL_WEIGHT * 100).toFixed(0)}%)
                      </div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-purple-50">
                      <div className="text-xl font-bold text-purple-700">
                        {submission.externalSimilarity.toFixed(2)}%
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
                        <CheckCircle2Icon className="h-5 w-5 mb-0.5" />
                      )}
                      <span className="font-semibold text-xs">
                        {isHigh ? "High Similarity" : "Low Similarity"}
                      </span>
                      <span className="text-[10px] opacity-80 mt-0.5">
                        {isHigh
                          ? `≥ ${HIGH_SIMILARITY_THRESHOLD}% — May need revisions`
                          : `< ${HIGH_SIMILARITY_THRESHOLD}% — Sufficiently original`}
                      </span>
                    </div>
                  </div>
                  {}
                  {submission.scoringBreakdown && (
                    <ScoringBreakdownCard
                      breakdown={submission.scoringBreakdown}
                    />
                  )}

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 font-medium mb-1">
                      Scoring Formula
                    </p>
                    <p className="text-sm text-[#444]">
                      Combined = (Internal × {INTERNAL_WEIGHT.toFixed(2)}) +
                      (External × {EXTERNAL_WEIGHT.toFixed(2)})
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Stage 1 retrieves Top 5; Stage 2 re-scores by research
                      aspects (objectives, subject, method). Raw cosine ≠
                      calibrated topical relatedness.
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

        <Card className="overflow-hidden shadow-md">
          <CardHeader className="pb-3 bg-gray-50 border-b border-gray-100">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4 text-[#8B1A1A]" /> Classification & Domain
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">
                SDG Categories
              </span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {submission.sdgCategories.length > 0 ? (
                  submission.sdgCategories.map((sdg, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-xs font-medium"
                    >
                      {sdg}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-400 italic">
                    Not classified
                  </span>
                )}
              </div>
            </div>
            <Separator />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">
                Field of IT
              </span>
              <p className="text-sm font-medium text-[#333] mt-1.5">
                {submission.fieldOfIt || "Not classified"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {}
      <Card className="mb-8">
        <CardContent className="p-5">
          <ApprovalProgressTracker
            steps={submission.approverSteps || []}
            currentRole={submission.currentApproverRole}
            fullyApproved={!!submission.fullyApprovedAt}
            status={submission.status}
            clickable={trackerClickable}
          />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
            <span>
              Submitted by{" "}
              <span className="font-medium text-[#333]">
                {submission.studentName || "Unknown"}
              </span>
            </span>
            <span>
              Version{" "}
              <span className="font-medium text-[#333]">
                V{submission.analysisVersion}
              </span>
            </span>
            <span>
              Submitted{" "}
              {new Date(submission.submittedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {submission.returnedReason && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <AlertCircle className="h-3 w-3" />
                Returned: {submission.returnedReason}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {}
      {submission.researchGapAnalysis && (
        <div className="mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-[#8B1A1A]" />
                Research Gap Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#333] leading-relaxed">
                {submission.researchGapAnalysis}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {}
      {submission.internalMatches.length > 0 && (
        <div className="mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Library className="h-4 w-4 text-[#8B1A1A]" />
                Top {submission.internalMatches.length} Internal Matches
                <span className="text-xs font-normal text-gray-400">
                  (Journals)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {submission.internalMatches.map((match, i) => (
                  <div
                    key={match.journalId ?? match.tafId}
                    className="p-3 rounded-lg bg-gray-50 border space-y-1"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#8B1A1A]/10 text-xs font-bold text-[#8B1A1A] shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#333]">
                          {match.title || match.proposedTitle}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {match.authors || match.studentName}{" "}
                          {match.year ? `• ${match.year}` : ""}
                        </p>
                        {(match.weakTopicalOverlap ||
                          match.campusNeighborOnly) && (
                          <span className="inline-block mt-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            {match.campusNeighborOnly
                              ? "Campus neighbor"
                              : "Weak topical overlap"}
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <JournalViewerButton
                          journalId={match.journalId}
                          highlightPhrases={match.highlightPhrases}
                        />
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            match.similarityPercent >= HIGH_SIMILARITY_THRESHOLD
                              ? "bg-red-50 text-red-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {match.similarityPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <AspectScoreBreakdown
                      aspects={match.aspects}
                      matchScore={match.similarityPercent}
                      weakTopicalOverlap={match.weakTopicalOverlap}
                      campusNeighborOnly={match.campusNeighborOnly}
                      phraseQuality={match.phraseQuality}
                      sectionExplanations={match.sectionExplanations}
                      overallJudgment={
                        submission.judgment as
                          | "high_similarity"
                          | "low_similarity"
                      }
                      matchTitle={match.title || match.proposedTitle}
                      compact
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {}
      {submission.externalMatches.length > 0 && (
        <div className="mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4 text-purple-600" />
                Top {submission.externalMatches.length} External Matches
                <span className="text-xs font-normal text-gray-400 ml-1">
                  (Google Scholar)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {submission.externalMatches.map((match, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-gray-50 border space-y-1"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-50 text-xs font-bold text-purple-700 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#333]">
                          {match.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {match.authors} {match.year ? `• ${match.year}` : ""}
                          {match.publication ? ` • ${match.publication}` : ""}
                        </p>
                        {match.weakTopicalOverlap && (
                          <span className="inline-block mt-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            Weak topical overlap
                          </span>
                        )}
                        {match.link && (
                          <a
                            href={match.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View source
                          </a>
                        )}
                      </div>
                      <div className="shrink-0">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            match.similarityPercent >= HIGH_SIMILARITY_THRESHOLD
                              ? "bg-red-50 text-red-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {match.similarityPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <AspectScoreBreakdown
                      aspects={match.aspects}
                      matchScore={match.similarityPercent}
                      weakTopicalOverlap={match.weakTopicalOverlap}
                      campusNeighborOnly={match.campusNeighborOnly}
                      phraseQuality={match.phraseQuality}
                      sectionExplanations={match.sectionExplanations}
                      overallJudgment={
                        submission.judgment as
                          | "high_similarity"
                          | "low_similarity"
                      }
                      matchTitle={match.title}
                      compact
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {}
      <div className="space-y-4 mb-8">
        <div className="bg-white rounded-lg border p-4">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Proposed Title
          </h4>
          {editable ? (
            <AnnotatableTitleField
              value={draft.proposedTitle}
              onChange={(v) => setDraftField("proposedTitle", v)}
            />
          ) : (
            <AnnotatedSection fieldKey="proposedTitle" html={snapshot?.proposedTitle} />
          )}
        </div>
        {sections.map((s) => (
          <div key={s.key} className="bg-white rounded-lg border p-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {s.label}
            </h4>
            {editable ? (
              <AnnotatableRichEditor
                fieldKey={s.key}
                value={draft[s.key]}
                onChange={(v) => setDraftField(s.key, v)}
              />
            ) : (
              <AnnotatedSection fieldKey={s.key} html={s.html} />
            )}
          </div>
        ))}

        {editable && (
          <div className="flex flex-col sm:flex-row gap-2 pt-1 items-start">
            <ToggleCommentMode />
            <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8B1A1A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Edits
            </button>
            {submission.status === "revisions_needed" && (
              <button
                type="button"
                onClick={handleResubmit}
                disabled={resubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {resubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Save &amp; Resubmit
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 ml-1">
              <FileText className="h-3 w-3" />
              {submission.status === "revisions_needed"
                ? "Resubmit sends it back to the adviser."
                : "Your edits update the submitted TAF and the draft."}
            </span>
            </div>
          </div>
        )}
      </div>
    </>
    </AnnotationLayer>
  );
}