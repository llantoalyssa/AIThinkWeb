import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { getCurrentUser } from "@/server/actions/auth";
import { getGrantedPermissions } from "@/server/actions/permissions";
import { getResearchAnalytics } from "@/server/actions/research-analytics";
import { rolePath } from "@/lib/constants";
import ResearchAnalytics from "@/components/research-analytics";

export default async function DepartmentAnalyticsPage({
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
  const canView = permissions.includes("analytics.view");
  const result = canView ? await getResearchAnalytics() : null;

  return (
      <div className="w-auto px-4 py-6">
      {canView && result && result.success ? (
        <ResearchAnalytics
          role="department"
          userId={id}
          hrefMode="flat"
          initialData={result.data}
        />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <ShieldAlert className="mb-3 h-8 w-8 text-gray-300" />
          <h3 className="mb-1 text-lg font-medium text-[#333]">
            {canView ? "Research Analytics unavailable" : "No access to Research Analytics"}
          </h3>
          <p className="max-w-md text-sm text-gray-500">
            {canView
              ? result && !result.success
                ? result.error
                : "The analytics could not be loaded. Please try again."
              : "This account has not been granted Research Analytics (analytics.view)."}
          </p>
        </div>
      )}
      </div>
  );
}