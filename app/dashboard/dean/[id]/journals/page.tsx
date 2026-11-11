// ============================================================
// /dashboard/dean/[id]/journals — READ-ONLY Journals for the dean.
//
// Reached by an account the department console granted `pages.journals`: the
// item appears in this role's side nav (components/approver-sidebar.tsx maps the
// grant to THIS route), and the page opens inside the role's own chrome.
//
// READ-ONLY BY CONSTRUCTION. Journals are the department's library: only
// `journals.manage` may upload, re-embed, edit or delete, and that permission is
// department-only (migration 058) — so `canManage` is computed from the grants
// and is false for every approver. The list itself is the SAME component the
// department renders, so a viewer can never be shown a control that would be
// refused, and the two surfaces cannot drift apart.
//
// A hand-typed URL by an UNGRANTED account renders the no-access notice instead
// of an empty table; getAllJournals() and RLS refuse the data regardless.
// ============================================================

import { redirect } from "next/navigation";
import { Eye } from "lucide-react";

import { getApproverPageShell } from "@/server/actions/approver-shell";
import { getAllJournals } from "@/server/actions/journals";
import ApproverPageFrame, { ApproverNoAccess } from "@/components/approver-page-frame";
import DepartmentJournals from "@/components/department-journals";
import { rolePath } from "@/lib/constants";

export default async function DeanJournals({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const shell = await getApproverPageShell();
  if (!shell.success) redirect("/login");

  const { user, permissions } = shell;
  // Another role's page, or someone else's id in the URL → the caller's own home.
  if (user.role !== "dean" || (id && user.id !== id)) {
    redirect(`${rolePath(user.role)}/${user.id}`);
  }

  const canView = permissions.includes("pages.journals");
  // Granted, not hardcoded: `journals.manage` is department-only, so this is
  // false for every approver — and stays right if this route is ever reused.
  const canManage = permissions.includes("journals.manage");
  const backHref = `${rolePath("dean")}/${id}`;
  const journals = canView ? await getAllJournals() : null;

  return (
    <ApproverPageFrame
      role="dean"
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
