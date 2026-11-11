import { redirect } from "next/navigation";

import { getApproverPageShell } from "@/server/actions/approver-shell";
import { getAuditLogs } from "@/server/audit";
import ApproverPageFrame, { ApproverNoAccess } from "@/components/approver-page-frame";
import AuditTrailView, {
  auditSearchFromParams,
} from "@/components/audit-trail-view";
import { rolePath } from "@/lib/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdviserAuditTrail({
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
  // Another role's page, or someone else's id in the URL → the caller's own home.
  if (user.role !== "adviser" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const canView = permissions.includes("pages.audit");
  const basePath = `${rolePath("adviser")}/${id}/audit-trail`;
  const backHref = `${rolePath("adviser")}/${id}`;

  // Not queried at all without the grant: an ungranted account must never cause
  // a read of audit_logs, even one RLS would only filter to zero rows.
  const { filters, query } = auditSearchFromParams(sp);
  const result = canView ? await getAuditLogs(query) : null;

  return (
    <ApproverPageFrame
      role="adviser"
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
