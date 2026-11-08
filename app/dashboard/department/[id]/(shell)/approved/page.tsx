

import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { getCurrentUser } from "@/server/actions/auth";
import { getGrantedPermissions } from "@/server/actions/permissions";
import { getApprovedTAFs } from "@/server/actions/approval-workflow";
import { rolePath } from "@/lib/constants";
import ApprovedTafTable from "@/components/approved-taf-table";

export default async function DepartmentApprovedPage({
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
  const canView = permissions.includes("taf.approved.view");
  const result = canView ? await getApprovedTAFs() : null;

  return (
      <div className="w-auto px-4 py-6">
      {canView && result && result.success ? (
        <ApprovedTafTable
          items={result.data}
          basePath={`${rolePath("department")}/${id}`}
          // "section" sent every row to ?section=submissions (the list, not the
          // TAF). The department HAS its own submission route, so rows open it.
          linkStyle="flat"
          description="Every fully approved TAF in the college. Clicking a row opens TAF Submissions."
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-gray-300" />
          <h3 className="mb-1 text-lg font-medium text-[#333]">
            {canView ? "Approved TAFs unavailable" : "No access to Approved TAFs"}
          </h3>
          <p className="max-w-md text-sm text-gray-500">
            {canView
              ? result && !result.success
                ? result.error
                : "The list could not be loaded. Please try again."
              : "This account has not been granted the Approved TAF list (taf.approved.view)."}
          </p>
        </div>
      )}
      </div>
  );
}
