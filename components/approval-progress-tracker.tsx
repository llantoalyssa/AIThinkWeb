"use client";
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

  currentRole: string | null;

  fullyApproved: boolean;

  status?: string;
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
  const isDecided = (s: ApproverStepInfo | null | undefined) =>
    !!s && (s.status === "approved" || s.status === "rejected");

  const lastDecidedIdx = steps.reduce(
    (acc, s, i) => (isDecided(s) ? i : acc),
    -1,
  );

  function phaseFor(idx: number): "past" | "current" | "future" {
    const step = steps[idx];
    if (step.status === "rejected") return "past";
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
  function chainPhaseFor(chainIdx: number): "past" | "current" | "future" {
    if (chainIdx === 0) {

      return status === "revisions_needed" ? "current" : "past";
    }
    return phaseFor(chainIdx - 1);
  }

  return (
    <>
      <div className="w-full overflow-x-auto">
        <div className="flex items-center justify-center min-w-max">
          {chain.map((step, idx) => {
            const phase = chainPhaseFor(idx);
            const approverStep = idx > 0 ? steps[idx - 1] : null;
            const hasNote = !!approverStep?.note;
            const returned = approverStep?.status === "rejected";
            const decided = isDecided(approverStep);

            return (
              <div key={step.key} className="flex items-center">
                {}
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
                    disabled={!decided}
                    title={decided ? `View ${step.label} decision` : step.label}
                    className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
                      decided
                        ? returned
                          ? "bg-red-100 text-red-600 hover:ring-2 hover:ring-red-300"
                          : "bg-green-100 text-green-600 hover:ring-2 hover:ring-green-300"
                        : phase === "current"
                          ? "bg-[#8B1A1A]/10 text-[#8B1A1A] ring-2 ring-[#8B1A1A]/30"
                          : "bg-gray-100 text-gray-400"
                    } ${clickable && decided ? "cursor-pointer" : "cursor-default"}`}
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
                  {}
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {}
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