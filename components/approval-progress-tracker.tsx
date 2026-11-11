"use client";

// ============================================================
// ApprovalProgressTracker — horizontal chain showing the TAF's
// approval flow: Student → Adviser → Associate Dean → Dean → VCRDES.
// Decided steps are clickable and open a dialog showing the
// decision note/feedback (approval note or return reason).
// ============================================================

import { useState } from "react";
import type { ApproverStepInfo } from "@/server/actions/group-submissions";
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  User,
  Loader2,
} from "lucide-react";

type Props = {
  steps: ApproverStepInfo[];
  /** Currently routed-to role, or null when with the student. */
  currentRole: string | null;
  /** True once the VCRDES has approved (final state). */
  fullyApproved: boolean;
  /** Optional: submission status for extra context. */
  status?: string;
  /** Whether decided steps are clickable (open the note dialog).
   *  Approvers see the tracker read-only, so pass false for them. */
  clickable?: boolean;
};

export default function ApprovalProgressTracker({
  steps,
  currentRole,
  fullyApproved,
  status,
  clickable = true,
}: Props) {
  const [selected, setSelected] = useState<ApproverStepInfo | null>(null);

  // Figure out the last decided step index (for phase coloring).
  // Only 'approved'/'rejected' count as decided — the columns default
  // to 'pending' which must NOT be treated as a decision.
  const isDecided = (s: ApproverStepInfo | null | undefined) =>
    !!s && (s.status === "approved" || s.status === "rejected");

  const lastDecidedIdx = steps.reduce(
    (acc, s, i) => (isDecided(s) ? i : acc),
    -1,
  );

  function phaseFor(idx: number): "past" | "current" | "future" {
    const step = steps[idx];
    if (step.status === "rejected") return "past"; // returned — show red
    if (fullyApproved) return "past";
    if (step.status === "approved") return "past";
    if (isDecided(step)) return "past";
    if (idx <= lastDecidedIdx) return "past";
    if (currentRole && step.role === currentRole) return "current";
    return "future";
  }

  const chain: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "student", label: "Student", icon: <User className="h-4 w-4" /> },
    ...steps.map((s) => ({
      key: s.role,
      label: s.label,
      icon: <User className="h-4 w-4" />,
    })),
  ];

  // Map phase to chain indexes: student is index 0, approvers are 1..4
  function chainPhaseFor(chainIdx: number): "past" | "current" | "future" {
    if (chainIdx === 0) {
      // Student step is always "past" once submitted, "current" if returned
      return status === "revisions_needed" ? "current" : "past";
    }
    return phaseFor(chainIdx - 1);
  }

  /**
   * The student's own step. It is DONE the moment the TAF is submitted — the
   * tracker used to print it as a gray "Pending" node even on a fully approved
   * TAF, next to four green approver nodes, which read as if the student had
   * not filed the paper at all.
   *
   *   submitted / routed / approved → green, "Submitted"
   *   revisions_needed              → red, "Returned"
   */
  const studentReturned = status === "revisions_needed";

  return (
    <>
      {/* py-2 is not decorative: this box scrolls horizontally, and a scroll
          container also clips vertically — the current step's ring-2 was cut off
          at the top and bottom of the circles. Padding gives the ring room. */}
      <div className="w-full overflow-x-auto px-1 py-2">
        <div className="flex items-center justify-center min-w-max">
          {chain.map((step, idx) => {
            const phase = chainPhaseFor(idx);
            const approverStep = idx > 0 ? steps[idx - 1] : null;
            const hasNote = !!approverStep?.note;
            const isStudentNode = idx === 0;
            // A submitted TAF IS the student's completed step.
            const returned = isStudentNode
              ? studentReturned
              : approverStep?.status === "rejected";
            const decided = isStudentNode ? true : isDecided(approverStep);

            return (
              <div key={step.key} className="flex items-center">
                {/* Connector line */}
                {idx > 0 && (
                  <div
                    className={`h-0.5 w-8 sm:w-14 ${
                      phase === "past" || (idx > 0 && chainPhaseFor(idx - 1) === "past")
                        ? "bg-green-500"
                        : "bg-gray-200"
                    }`}
                  />
                )}

                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => clickable && approverStep && setSelected(approverStep)}
                    disabled={!approverStep}
                    title={
                      approverStep
                        ? `View ${step.label} decision`
                        : isStudentNode
                          ? studentReturned
                            ? "Returned to the student"
                            : "Submitted by the student"
                          : step.label
                    }
                    className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                      decided
                        ? returned
                          ? "bg-red-100 text-red-600 hover:ring-2 hover:ring-red-300"
                          : "bg-green-100 text-green-600 hover:ring-2 hover:ring-green-300"
                        : phase === "current"
                          ? "bg-[#8B1A1A]/10 text-[#8B1A1A] ring-2 ring-[#8B1A1A]/30"
                          : "bg-gray-100 text-gray-400"
                    } ${clickable && approverStep && decided ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {decided ? (
                      returned ? (
                        <XCircle className="h-6 w-6" />
                      ) : (
                        <CheckCircle2 className="h-6 w-6" />
                      )
                    ) : phase === "current" ? (
                      <Clock className="h-6 w-6" />
                    ) : (
                      <span className="scale-[1.5]">{step.icon}</span>
                    )}
                  </button>
                  <span
                    className={`mt-1.5 text-[11px] font-medium whitespace-nowrap ${
                      decided
                        ? returned
                          ? "text-red-600"
                          : "text-green-600"
                        : phase === "current"
                          ? "text-[#8B1A1A]"
                          : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                  {/* Status badge */}
                  <span
                    className={`mt-0.5 inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${
                      decided
                        ? returned
                          ? "border-red-200 bg-red-50 text-red-600"
                          : "border-green-200 bg-green-50 text-green-600"
                        : phase === "current"
                          ? "border-[#8B1A1A]/20 bg-[#8B1A1A]/5 text-[#8B1A1A]"
                          : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}
                  >
                    {decided
                      ? returned
                        ? "Returned"
                        : isStudentNode
                          ? "Submitted"
                          : "Approved"
                      : phase === "current"
                        ? "In Progress"
                        : "Pending"}
                  </span>
                  {hasNote && (
                    <span className="mt-0.5 text-[9px] text-gray-400 flex items-center gap-0.5">
                      <FileText className="h-2.5 w-2.5" /> note
                    </span>
                  )}
                  {/* A stand-in decided this step: the department (which has no
                      level in the chain) or an owner acting on the entry step. */}
                  {approverStep?.standIn && (
                    <span className="mt-0.5 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-600">
                      Stand-in
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Decision note dialog ──────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelected(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              {selected.status === "rejected" ? (
                <XCircle className="h-5 w-5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              <h3 className="text-base font-semibold text-[#333]">
                {selected.label} —{" "}
                {selected.status === "rejected" ? "Returned" : "Approved"}
              </h3>
            </div>
            {selected.decidedAt && (
              <p className="text-xs text-gray-400 mb-2">
                {new Date(selected.decidedAt).toLocaleString()}
              </p>
            )}
            {/* WHO decided this step — the audit trail names the account, not
                just the role, because a stand-in may have acted in its place. */}
            {selected.actorName && (
              <p className="text-xs text-gray-500 mb-3">
                Decided by{" "}
                <span className="font-medium text-[#333]">
                  {selected.actorName}
                </span>
                {selected.actorRole && (
                  <> ({selected.actorRole.replace("_", " ")})</>
                )}
                {selected.standIn && (
                  <>
                    {" "}
                    — a stand-in for the {selected.role.replace("_", " ")} step
                  </>
                )}
              </p>
            )}
            <div
              className={`rounded-xl p-4 text-sm leading-relaxed ${
                selected.status === "rejected"
                  ? "bg-red-50 text-red-800"
                  : "bg-green-50 text-green-800"
              }`}
            >
              {selected.note || (
                <span className="italic opacity-70">
                  No note provided for this decision.
                </span>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
