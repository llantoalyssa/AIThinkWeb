// ============================================================
// /dashboard/adviser/[id]/executive-summary — the Executive Summary an adviser
// may be granted (`executive_summary.view`).
//
// SCOPE, stated on the page: the dean's copy counts the whole college because RLS
// lets a dean read every submission. An adviser's copy would silently count only
// the groups they own, so the banner says so instead of letting a narrower number
// pass for the college-wide figure.
//
// A SERVER page: grant check + payload resolve before the first paint.
// ============================================================

import { redirect } from "next/navigation";

import ApproverPageFrame, {
  ApproverNoAccess,
} from "@/components/approver-page-frame";
import ExecutiveSummary from "@/components/executive-summary";
import { getApproverPageShell } from "@/server/actions/approver-shell";
import { getExecutiveSummary } from "@/server/actions/executive-summary";
import { rolePath } from "@/lib/constants";

export default async function AdviserExecutiveSummaryPage({
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
  const canView = permissions.includes("executive_summary.view");
  const result = canView ? await getExecutiveSummary() : null;

  return (
    <ApproverPageFrame
      role="adviser"
      urlUserId={id}
      user={user}
      permissions={permissions}
    >
      {!canView ? (
        <ApproverNoAccess
          title="No access to the Executive Summary"
          message="Your account has not been granted the Executive Summary. Ask a department account to grant it."
          backHref={base}
        />
      ) : result && result.success ? (
        <>
          <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
            <span className="font-medium text-[#333]">Scope:</span> this summary
            counts the TAF submissions of the advisory groups you supervise. The
            dean&apos;s copy covers the whole college.
          </div>
          <ExecutiveSummary initialData={result.data} />
        </>
      ) : (
        <ApproverNoAccess
          title="Executive Summary unavailable"
          message={result && !result.success ? result.error : "The summary could not be loaded. Please try again."}
          backHref={base}
        />
      )}
    </ApproverPageFrame>
  );
}
