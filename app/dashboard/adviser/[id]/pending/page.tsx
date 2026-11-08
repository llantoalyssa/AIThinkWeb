

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, FileText, Inbox } from "lucide-react";

import ApproverPageFrame, {
  ApproverNoAccess,
} from "@/components/approver-page-frame";
import { getApproverPageShell } from "@/server/actions/approver-shell";
import { getPendingApprovals } from "@/server/actions/approval-workflow";
import { rolePath } from "@/lib/constants";
import { groupSlug } from "@/lib/slug";

/** Approval-chain step → what the adviser should call it. */
const STEP_LABELS: Record<string, string> = {
  adviser: "Adviser",
  associate_dean: "Associate Dean",
  dean: "Dean",
  vcrdes: "VCRDES",
  department: "Department",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AdviserPendingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const shell = await getApproverPageShell();
  if (!shell.success) redirect("/login");

  const { user, permissions } = shell;
  if (user.role !== "adviser" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const base = `${rolePath("adviser")}/${id}`;
  const canParticipate = permissions.includes("approval.participate");
  const result = canParticipate ? await getPendingApprovals() : null;
  const rows = result && result.success ? result.data : [];

  return (
    <ApproverPageFrame
      role="adviser"
      urlUserId={id}
      user={user}
      permissions={permissions}
    >
      {!canParticipate ? (
        <ApproverNoAccess
          title="No access to Pending TAFs"
          message="Your account has not been granted participation in approvals. Ask a department account to grant it."
          backHref={base}
        />
      ) : result && !result.success ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {result.error}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold text-[#333] sm:text-2xl">Pending TAFs</h1>
            <p className="mt-1 text-sm text-gray-500">
              Topic Abstract Forms currently routed to you, across every advisory
              group you supervise.
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
              <Inbox className="mb-3 h-10 w-10 text-gray-300" />
              <h2 className="mb-1 text-base font-medium text-[#333]">
                Nothing waiting on you
              </h2>
              <p className="text-sm text-gray-500">
                New submissions from your advisory groups will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Phones: one card per TAF — the table's six columns would push
                  the current step and the open affordance off-screen. */}
              <div className="space-y-2 md:hidden">
                {rows.map((row) => (
                  <Link
                    key={row.id}
                    href={`${base}/group/${groupSlug(row.groupName)}/submission/${row.id}`}
                    className="block rounded-xl border border-gray-200 bg-white p-3 transition-colors active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 flex-1 text-sm font-medium text-[#333]">
                        {row.proposedTitle}
                      </p>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-[#8B1A1A]/10 px-2 py-0.5 text-[11px] font-medium text-[#8B1A1A]">
                        {STEP_LABELS[row.currentApproverRole ?? ""] ?? "Pending"}
                      </span>
                      <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                        {row.combinedScore.toFixed(1)}% similarity
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <div className="min-w-0">
                        <dt className="text-gray-400">Advisory Group</dt>
                        <dd className="truncate">{row.groupName || "—"}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-gray-400">Submitted</dt>
                        <dd className="whitespace-nowrap">{formatDate(row.submittedAt)}</dd>
                      </div>
                    </dl>
                  </Link>
                ))}
              </div>

              {/* md+ keeps the table. */}
              <div className="hidden overflow-x-auto rounded-xl border bg-white md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3 font-semibold">TAF Title</th>
                      <th className="px-4 py-3 font-semibold">Advisory Group</th>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="px-4 py-3 font-semibold">Submitted</th>
                      <th className="px-4 py-3 font-semibold">Step</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="transition-colors hover:bg-gray-50/70"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`${base}/group/${groupSlug(row.groupName)}/submission/${row.id}`}
                            className="flex items-center gap-2 font-medium text-[#333] hover:text-[#8B1A1A]"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-gray-300" />
                            <span className="line-clamp-1 max-w-[320px]">
                              {row.proposedTitle}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{row.groupName || "—"}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.studentName}
                          {row.studentSrCode ? (
                            <span className="block text-xs text-gray-400">
                              {row.studentSrCode}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                          {formatDate(row.submittedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-[#8B1A1A]/10 px-2.5 py-0.5 text-xs font-medium text-[#8B1A1A]">
                            {STEP_LABELS[row.currentApproverRole ?? ""] ?? "Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`${base}/group/${groupSlug(row.groupName)}/submission/${row.id}`}
                            aria-label={`Open ${row.proposedTitle}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:bg-gray-100 hover:text-[#8B1A1A]"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </ApproverPageFrame>
  );
}
