import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { getCurrentUser } from "@/server/actions/auth";
import { getGrantedPermissions } from "@/server/actions/permissions";
import { rolePath } from "@/lib/constants";
import DepartmentShell from "@/components/department-shell";
import ApproverPageFrame, {
  type ApproverPageRole,
} from "@/components/approver-page-frame";
import CostLogsClient from "./cost-logs-client";

function NoAccess({ backHref }: { backHref: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
      <ShieldAlert className="mb-3 h-8 w-8 text-gray-300" />
      <h3 className="mb-1 text-lg font-medium text-[#333]">
        No access to Cost Logs
      </h3>
      <p className="mb-4 max-w-md text-sm text-gray-500">
        This account has not been granted the Cost Logs page (pages.cost_logs).
        Ask a department account to grant it.
      </p>
      <a
        href={backHref}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
      >
        Back to Dashboard
      </a>
    </div>
  );
}

export default async function CostLogsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const permissions = await getGrantedPermissions(user.id);
  const canView = permissions.includes("pages.cost_logs");
  const home = `${rolePath(user.role)}/${user.id}`;
  if (user.role === "student") redirect(home);

  const body = canView ? (
    <div className="mx-auto w-full">
      <CostLogsClient />
    </div>
  ) : (
    <NoAccess backHref={home} />
  );

  if (user.role === "department") {
    return (
      <DepartmentShell user={user} userId={user.id} active="cost-logs" permissions={permissions}>
        <div className="w-auto px-4 py-6">{body}</div>
      </DepartmentShell>
    );
  }

  return (
    <ApproverPageFrame
      role={user.role as ApproverPageRole}
      urlUserId={user.id}
      user={user}
      permissions={permissions}
    >
      {body}
    </ApproverPageFrame>
  );
}