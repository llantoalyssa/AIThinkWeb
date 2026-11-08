// ============================================================

import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { getCurrentUser } from "@/server/actions/auth";
import { getAuditLogs } from "@/server/audit";
import { getGrantedPermissions } from "@/server/actions/permissions";
import { rolePath } from "@/lib/constants";
import AuditTrailView, {
  auditSearchFromParams,
} from "@/components/audit-trail-view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditTrailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "department") {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const { filters, query } = auditSearchFromParams(sp);
  const permissions = await getGrantedPermissions(user.id);
  const canView = permissions.includes("pages.audit");
  const result = canView ? await getAuditLogs(query) : null;

  return (
      <div className="w-auto px-4 py-6">
        {canView && result ? (
          <AuditTrailView
            result={result}
            basePath={`/dashboard/department/${id}/audit-trail`}
            filters={filters}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
            <ShieldAlert className="mb-3 h-8 w-8 text-gray-300" />
            <h3 className="mb-1 text-lg font-medium text-[#333]">
              No access to the Audit Trail
            </h3>
            <p className="max-w-md text-sm text-gray-500">
              Your account has not been granted the Audit Trail page. Ask a
              department account to grant it.
            </p>
          </div>
        )}
      </div>
  );
}
