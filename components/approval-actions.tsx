"use client";
import { useState } from "react";
import {
  approveSubmission,
  returnSubmission,
} from "@/server/actions/approval-workflow";
import { CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  submissionId: string;
  onDecided?: () => void;
};

export default function ApprovalActions({
  submissionId,
  onDecided,
}: Props) {
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [deciding, setDeciding] = useState<"approve" | "return" | null>(null);

  async function handleApprove() {
    setDeciding("approve");
    const result = await approveSubmission(submissionId);
    setDeciding(null);
    if (result.success) {
      toast.success(result.message);
      onDecided?.();
    } else {
      toast.error(result.error);
    }
  }

  async function handleReturn() {
    if (!returnReason.trim()) {
      toast.error("Please provide a reason for returning the TAF.");
      return;
    }
    setDeciding("return");
    const result = await returnSubmission(submissionId, returnReason.trim());
    setDeciding(null);
    if (result.success) {
      toast.success(result.message);
      setShowReturnDialog(false);
      setReturnReason("");
      onDecided?.();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={handleApprove}
          disabled={deciding !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {deciding === "approve" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Approve
        </button>
        <button
          type="button"
          onClick={() => setShowReturnDialog(true)}
          disabled={deciding !== null}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
          Return for Revision
        </button>
      </div>

      {}
      {showReturnDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowReturnDialog(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[#333] mb-1">
              Return TAF for Revision
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              The TAF goes back to the student. They can edit and resubmit it.
            </p>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Reason for returning (e.g., objectives need refinement, add more related literature)…"
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
            />
            <div className="flex flex-wrap justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowReturnDialog(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReturn}
                disabled={deciding === "return" || !returnReason.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deciding === "return" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Return TAF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}