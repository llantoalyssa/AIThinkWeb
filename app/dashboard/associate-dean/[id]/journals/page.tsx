

import { redirect } from "next/navigation";
import { Eye } from "lucide-react";

import { getApproverPageShell } from "@/server/actions/approver-shell";
import { getAllJournals } from "@/server/actions/journals";
import ApproverPageFrame, { ApproverNoAccess } from "@/components/approver-page-frame";
import DepartmentJournals from "@/components/department-journals";
import { rolePath } from "@/lib/constants";

export default async function AssociateDeanJournals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const shell = await getApproverPageShell();
  if (!shell.success) redirect("/login");

  const { user, permissions } = shell;
  // Another role's page, or someone else's id in the URL → the caller's own home.
  if (user.role !== "associate_dean" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const canView = permissions.includes("pages.journals");
  // Granted, not hardcoded: `journals.manage` is department-only, so this is
  // false for every approver — and stays right if this route is ever reused.
  const canManage = permissions.includes("journals.manage");
  const backHref = `${rolePath("associate_dean")}/${id}`;
  const journals = canView ? await getAllJournals() : null;

  return (
    <ApproverPageFrame
      role="associate_dean"
      urlUserId={id}
      user={user}
      permissions={permissions}
    >
      {canView ? (
        <>
          {!canManage && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
              <Eye className="h-3.5 w-3.5 text-gray-400" />
              Read-only — a department account manages this journal library.
            </div>
          )}
          <DepartmentJournals
            initialJournals={journals && journals.success ? journals.data : undefined}
            canManage={canManage}
          />
        </>
      ) : (
        <ApproverNoAccess
          title="No access to Journals"
          message="Your account has not been granted the Journals page. Ask a department account to grant it."
          backHref={backHref}
        />
      )}
    </ApproverPageFrame>
  );
}
