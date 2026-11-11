import { redirect } from "next/navigation";

import ApproverPageFrame, {
  ApproverNoAccess,
} from "@/components/approver-page-frame";
import ApprovedTafTable from "@/components/approved-taf-table";
import { getApproverPageShell } from "@/server/actions/approver-shell";
import { getApprovedTAFs } from "@/server/actions/approval-workflow";
import { rolePath } from "@/lib/constants";

export default async function AdviserApprovedPage({
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
  const canView = permissions.includes("taf.approved.view");
  const result = canView ? await getApprovedTAFs() : null;

  return (
    <ApproverPageFrame
      role="adviser"
      urlUserId={id}
      user={user}
      permissions={permissions}
    >
      {!canView ? (
        <ApproverNoAccess
          title="No access to Approved TAFs"
          message="Your account has not been granted the Approved TAF list. Ask a department account to grant it."
          backHref={base}
        />
      ) : result && result.success ? (
        <ApprovedTafTable
          items={result.data}
          basePath={base}
          linkStyle="group"
          description="Fully approved TAFs from the advisory groups you supervise."
        />
      ) : (
        <ApproverNoAccess
          title="Approved TAFs unavailable"
          message={result && !result.success ? result.error : "The list could not be loaded. Please try again."}
          backHref={base}
        />
      )}
    </ApproverPageFrame>
  );
}
