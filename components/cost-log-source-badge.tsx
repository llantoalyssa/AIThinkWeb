import { BrainCircuit, RefreshCw, BookOpen, Sparkles } from "lucide-react";
export const SOURCE_META: Record<
  string,
  { label: string; description: string; badgeClass: string; icon: React.ReactNode }
> = {
  taf_analyze: {
    label: "TAF Analyze",
    description:
      "First analysis of a student's Thesis Adviser Form (V1). Runs SBERT internal matching, Google Scholar search, and AI classification (SDG, field, gap analysis, recommendations).",
    badgeClass: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    icon: <BrainCircuit className="h-3.5 w-3.5" />,
  },
  taf_reanalyze: {
    label: "TAF Re-analyze",
    description:
      "Re-analysis of a TAF after the student revised it (V2+). Same full pipeline as TAF Analyze: SBERT, Google Scholar, and AI classification on the updated content.",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <RefreshCw className="h-3.5 w-3.5" />,
  },
  journal: {
    label: "Journal Upload",
    description:
      "AI metadata extraction when a journal PDF is uploaded (extracts title + authors from the document text). AI tokens only — no Google Scholar search.",
    badgeClass: "bg-green-50 text-green-700 border border-green-200",
    icon: <BookOpen className="h-3.5 w-3.5" />,
  },
  other: {
    label: "Other",
    description: "Miscellaneous AI usage not tied to TAF analysis or journal uploads.",
    badgeClass: "bg-gray-50 text-gray-600 border border-gray-200",
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
};

export function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] || SOURCE_META.other;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}