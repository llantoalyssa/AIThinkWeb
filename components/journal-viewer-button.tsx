"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getJournalById, type JournalView } from "@/server/actions/journals";

type Props = {
  journalId?: string;

  size?: "sm" | "md";
};

export default function JournalViewerButton({
  journalId,
  size = "sm",
}: Props) {
  const [viewing, setViewing] = useState<JournalView | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  async function openJournal() {
    if (!journalId) return;
    setLoadingView(true);
    const result = await getJournalById(journalId);
    setLoadingView(false);
    if (result.success) {
      setViewing(result.data);
    } else {
      toast.error(result.error);
    }
  }

  const btnSize =
    size === "md"
      ? "h-8 w-8 rounded-lg"
      : "h-7 w-7 rounded-lg";

  return (
    <>
      <button
        type="button"
        onClick={openJournal}
        disabled={!journalId || loadingView}
        title={journalId ? "View this journal" : "Journal file not available"}
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
          if (!open) setViewing(null);
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
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 min-h-[85vh] bg-gray-100">
                {viewing.fileUrl ? (
                  <iframe
                    src={viewing.fileUrl}
                    title={viewing.title}
                    className="w-full h-full min-h-[85vh]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    This journal has no viewable file.
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}