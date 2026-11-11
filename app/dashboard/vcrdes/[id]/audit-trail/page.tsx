// ============================================================
// /dashboard/vcrdes/[id]/audit-trail — READ-ONLY Audit Trail for the VCRDES.
//
// Reached by an account the department console granted `pages.audit`: the item
// appears in this role's side nav (components/approver-sidebar.tsx) and the page
// opens inside the role's own chrome.
//
// A SERVER page, exactly like the department's: paging and filtering live in the
// URL and the slice is queried on the server, so there is no client fetch and
// every view is linkable. The table is the SHARED one
// (components/audit-trail-view.tsx) — the department and the four approver roles
// render one table, not five copies.
//
// READ-ONLY BY CONSTRUCTION: the view has no write control, audit_logs has a
// SELECT policy only (migration 057 grants it to `pages.audit` and adds no
// INSERT/UPDATE/DELETE), and getAuditLogs() refuses a caller without the grant.
// ============================================================

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
  // Another role's page, or someone else's id in the URL → the caller's own home.
  if (user.role !== "vcrdes" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const canView = permissions.includes("pages.audit");
  const basePath = `${rolePath("vcrdes")}/${id}/audit-trail`;
  const backHref = `${rolePath("vcrdes")}/${id}`;

  // Not queried at all without the grant: an ungranted account must never cause
  // a read of audit_logs, even one RLS would only filter to zero rows.
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
