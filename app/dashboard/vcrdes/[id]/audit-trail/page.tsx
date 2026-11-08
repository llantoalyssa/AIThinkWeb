import { redirect } from "next/navigation";

import { getApproverPageShell } from "@/server/actions/approver-shell";
import { getAuditLogs } from "@/server/audit";
import ApproverPageFrame, { ApproverNoAccess } from "@/components/approver-page-frame";
import AuditTrailView, {
  auditSearchFromParams,
} from "@/components/audit-trail-view";
import { rolePath } from "@/lib/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function VcrdesAuditTrail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const shell = await getApproverPageShell();
  if (!shell.success) redirect("/login");

  const { user, permissions } = shell;

  if (user.role !== "vcrdes" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const canView = permissions.includes("pages.audit");
  const basePath = `${rolePath("vcrdes")}/${id}/audit-trail`;
  const backHref = `${rolePath("vcrdes")}/${id}`;
  const { filters, query } = auditSearchFromParams(sp);
  const result = canView ? await getAuditLogs(query) : null;

  return (
    <ApproverPageFrame
      role="vcrdes"
      urlUserId={id}
      user={user}
      permissions={permissions}
    >
      {canView && result ? (
        <AuditTrailView result={result} basePath={basePath} filters={filters} />
      ) : (
        <ApproverNoAccess
          title="No access to the Audit Trail"
          message="Your account has not been granted the Audit Trail. Ask a department account to grant it."
          backHref={backHref}
        />
      )}
    </ApproverPageFrame>
  );
}