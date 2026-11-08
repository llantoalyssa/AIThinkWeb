

import { redirect } from "next/navigation";

import ApproverPageFrame, {
  ApproverNoAccess,
} from "@/components/approver-page-frame";
import ResearchAnalytics from "@/components/research-analytics";
import { getApproverPageShell } from "@/server/actions/approver-shell";
import { getResearchAnalytics } from "@/server/actions/research-analytics";
import { rolePath } from "@/lib/constants";

export default async function AdviserAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const shell = await getApproverPageShell();
  if (!shell.success) redirect("/login");

  const { user, permissions } = shell;
  // Another role's page, or someone else's id in the URL → the caller's home.
  if (user.role !== "adviser" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const base = `${rolePath("adviser")}/${id}`;
  const canView = permissions.includes("analytics.view");
  // Not queried at all without the grant — and the action refuses it anyway.
  const result = canView ? await getResearchAnalytics() : null;

  return (
    <ApproverPageFrame
      role="adviser"
      urlUserId={id}
      user={user}
      permissions={permissions}
    >
      {!canView ? (
        <ApproverNoAccess
          title="No access to Research Analytics"
          message="Your account has not been granted Research Analytics. Ask a department account to grant it."
          backHref={base}
        />
      ) : result && result.success ? (
        <>
          {result.data.approvedTafs.length === 0 && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">
                No fully approved TAFs in the groups you supervise yet.
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Research Analytics counts only FULLY approved TAFs, and the database
                limits an adviser to the advisory groups they own — every other
                submission is filtered out before the numbers are built, so this is
                not an empty screen but an empty scope. The charts fill in as soon as
                one of your groups clears the whole approval chain.
              </p>
            </div>
          )}
          <ResearchAnalytics
            role="adviser"
            userId={id}
            hrefMode="group"
            initialData={result.data}
          />
        </>
      ) : (
        <ApproverNoAccess
          title="Research Analytics unavailable"
          message={result && !result.success ? result.error : "The analytics could not be loaded. Please try again."}
          backHref={base}
        />
      )}
    </ApproverPageFrame>
  );
}
