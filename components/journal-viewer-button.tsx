"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Copy, Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { getJournalById, type JournalView } from "@/server/actions/journals";
import { escapeRegExp } from "@/lib/overlap-phrases";
import { isInstitutionalPhrase } from "@/lib/boilerplate";

type Props = {
  journalId?: string;
  size?: "sm" | "md";
  /** Phrases/sentences from analysis to highlight in extracted journal text. */
  highlightPhrases?: string[];
};

function HighlightedText({
  text,
  phrases,
}: {
  text: string;
  phrases: string[];
}) {
  const nodes = useMemo(() => {
    if (!text) return [<span key="empty">No extracted text available.</span>];
    const usable = phrases
      .map((p) => p.trim())
      .filter((p) => p.length >= 6)
      .sort((a, b) => b.length - a.length)
      .slice(0, 12);
    if (usable.length === 0) {
      return [<span key="plain">{text.slice(0, 12000)}</span>];
    }
    const pattern = usable.map(escapeRegExp).join("|");
    const re = new RegExp(`(${pattern})`, "gi");
    const parts = text.slice(0, 12000).split(re);
    return parts.map((part, i) => {
      const isHit = usable.some(
        (p) => p.toLowerCase() === part.toLowerCase(),
      );
      if (isHit) {
        return (
          <mark key={i} className="bg-amber-200 text-[#333] rounded px-0.5">
            {part}
          </mark>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }, [text, phrases]);

  return (
    <p className="text-xs leading-relaxed text-[#333] whitespace-pre-wrap">
      {nodes}
    </p>
  );
}

async function copyPhrase(phrase: string) {
  try {
    await navigator.clipboard.writeText(phrase);
    toast.success("Phrase copied");
  } catch {
    toast.error("Could not copy phrase");
  }
}

export default function JournalViewerButton({
  journalId,
  size = "sm",
  highlightPhrases = [],
}: Props) {
  const [viewing, setViewing] = useState<JournalView | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [findTip, setFindTip] = useState<string | null>(null);
  const textPaneRef = useRef<HTMLDivElement | null>(null);

  async function openJournal() {
    if (!journalId) return;
    setLoadingView(true);
    setFindTip(null);
    const result = await getJournalById(journalId);
    setLoadingView(false);
    if (result.success) {
      setViewing(result.data);
    } else {
      toast.error(result.error);
    }
  }

  useEffect(() => {
    if (!viewing || highlightPhrases.length === 0) return;
    const t = window.setTimeout(() => {
      const mark = textPaneRef.current?.querySelector("mark");
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [viewing, highlightPhrases]);

  const btnSize =
    size === "md" ? "h-8 w-8 rounded-lg" : "h-7 w-7 rounded-lg";
  const hasHighlights = highlightPhrases.length > 0;
  const topicalPhrases = highlightPhrases.filter((p) => !isInstitutionalPhrase(p));
  const institutionalPhrases = highlightPhrases.filter((p) =>
    isInstitutionalPhrase(p),
  );

  async function findInPdf(phrase: string) {
    await copyPhrase(phrase);
    setFindTip(
      "Use Ctrl+F / Cmd+F in the PDF panel and paste to find this phrase.",
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openJournal}
        disabled={!journalId || loadingView}
        title={
          journalId
            ? hasHighlights
              ? "View journal with overlapping phrases highlighted"
              : "View this journal"
            : "Journal file not available"
        }
        aria-label="View this journal"
        className={`flex items-center justify-center border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-[#8B1A1A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${btnSize}`}
      >
        {loadingView ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>

      <Dialog
        open={viewing != null}
        onOpenChange={(open) => {
          if (!open) {
            setViewing(null);
            setFindTip(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[95vw] lg:max-w-7xl max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden z-[90]">
          {viewing && (
            <>
              <DialogHeader className="px-6 py-4 border-b shrink-0">
                <DialogTitle className="text-base text-[#333] pr-8 line-clamp-1">
                  {viewing.title}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {[viewing.authors, viewing.year]
                    .filter(Boolean)
                    .join(" • ") || "Journal"}
                  {viewing.hasText ? "" : " • (no text extracted)"}
                  {hasHighlights
                    ? " • Amber highlights = overlapping phrases with your TAF"
                    : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 bg-gray-100">
                <div className="min-h-[50vh] lg:min-h-[85vh] border-b lg:border-b-0 lg:border-r border-gray-200">
                  {viewing.fileUrl ? (
                    <iframe
                      src={viewing.fileUrl}
                      title={viewing.title}
                      className="w-full h-full min-h-[50vh] lg:min-h-[85vh]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400 p-6">
                      This journal has no viewable file.
                    </div>
                  )}
                </div>
                <div className="flex flex-col min-h-[40vh] lg:min-h-[85vh] bg-white">
                  <div className="px-4 py-2 border-b bg-amber-50 shrink-0 space-y-2">
                    <div>
                      <p className="text-xs font-semibold text-amber-900">
                        Overlapping phrases in extracted text
                      </p>
                      <p className="text-[10px] text-amber-800/80 mt-0.5">
                        Direct PDF markup is limited in the browser, so matches are
                        highlighted here in the journal&apos;s extracted text.
                        {hasHighlights
                          ? ` ${highlightPhrases.length} phrase(s) from analysis.`
                          : " Re-analyze to detect shared phrases."}
                      </p>
                    </div>
                    {findTip && (
                      <p className="text-[10px] font-medium text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-2 py-1.5">
                        {findTip}
                      </p>
                    )}
                    {topicalPhrases.length > 0 && (
                      <PhraseChipGroup
                        label="Topical"
                        phrases={topicalPhrases}
                        variant="topical"
                        onCopy={copyPhrase}
                        onFindInPdf={findInPdf}
                      />
                    )}
                    {institutionalPhrases.length > 0 && (
                      <PhraseChipGroup
                        label="Campus / template"
                        phrases={institutionalPhrases}
                        variant="institutional"
                        onCopy={copyPhrase}
                        onFindInPdf={findInPdf}
                      />
                    )}
                  </div>
                  <div
                    ref={textPaneRef}
                    className="flex-1 overflow-y-auto p-4"
                  >
                    {viewing.extractedText ? (
                      <HighlightedText
                        text={viewing.extractedText}
                        phrases={highlightPhrases}
                      />
                    ) : (
                      <p className="text-sm text-gray-400 italic">
                        No extracted text available to highlight.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PhraseChipGroup({
  label,
  phrases,
  variant,
  onCopy,
  onFindInPdf,
}: {
  label: string;
  phrases: string[];
  variant: "topical" | "institutional";
  onCopy: (p: string) => void;
  onFindInPdf: (p: string) => void;
}) {
  const chipClass =
    variant === "topical"
      ? "bg-amber-100 text-amber-900 border-amber-200"
      : "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <div>
      <p className="text-[9px] font-semibold text-gray-600 mb-1">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {phrases.slice(0, 8).map((p) => (
          <li
            key={p}
            className={`inline-flex items-start gap-1 text-[10px] border rounded pl-1.5 pr-0.5 py-0.5 max-w-full ${chipClass}`}
          >
            <span className="break-words whitespace-normal min-w-0">
              {p}
            </span>
            <button
              type="button"
              onClick={() => onCopy(p)}
              className="shrink-0 p-0.5 rounded hover:bg-black/5 cursor-pointer"
              title="Copy phrase"
              aria-label="Copy phrase"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onFindInPdf(p)}
              className="shrink-0 p-0.5 rounded hover:bg-black/5 cursor-pointer"
              title="Find in PDF (copy + tip)"
              aria-label="Find in PDF"
            >
              <Search className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
