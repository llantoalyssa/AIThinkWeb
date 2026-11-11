// ============================================================
// /dashboard/department/[id]/executive-summary — the college-wide Executive
// Summary, for the department (a default since migration 053).
//
// The component is the dean's own. The DATA scope is decided by RLS, and the
// department may read every submission (migration 055), so this report means
// what its title says for this role — unlike an adviser, whose rows RLS would
// filter down to their own groups, which is why `executive_summary.view` is not
// offered to advisers in the catalogue (migration 061).
// ============================================================

import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { getCurrentUser } from "@/server/actions/auth";
import { getGrantedPermissions } from "@/server/actions/permissions";
import { getExecutiveSummary } from "@/server/actions/executive-summary";
import { rolePath } from "@/lib/constants";
import ExecutiveSummary from "@/components/executive-summary";

export default async function DepartmentExecutiveSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "department" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const permissions = await getGrantedPermissions(user.id);
  const canView = permissions.includes("executive_summary.view");
  const result = canView ? await getExecutiveSummary() : null;

  return (
      <div className="w-auto px-4 py-6">
      {canView && result && result.success ? (
        <ExecutiveSummary initialData={result.data} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-gray-300" />
          <h3 className="mb-1 text-lg font-medium text-[#333]">
            {canView ? "Executive Summary unavailable" : "No access to the Executive Summary"}
          </h3>
          <p className="max-w-md text-sm text-gray-500">
            {canView
              ? result && !result.success
                ? result.error
                : "The summary could not be loaded. Please try again."
              : "This account has not been granted the Executive Summary (executive_summary.view)."}
          </p>
        </div>
      )}
      </div>
  );
}
