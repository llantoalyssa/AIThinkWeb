import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { getCurrentUser } from "@/server/actions/auth";
import { AUDIT_PER_PAGE, getAuditLogs } from "@/server/audit";
import { AUDIT_CATEGORIES, auditActionLabel, auditCategoryLabel } from "@/lib/audit";
import { rolePath } from "@/lib/constants";
import DepartmentShell from "@/components/department-shell";
import AuditFilters from "./audit-filters";
const TZ = "Asia/Manila";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

const CATEGORY_STYLE: Record<string, string> = {
  auth: "bg-blue-50 text-blue-700 border-blue-200",
  submission: "bg-indigo-50 text-indigo-700 border-indigo-200",
  deletion: "bg-red-50 text-red-700 border-red-200",
  account: "bg-emerald-50 text-emerald-700 border-emerald-200",
  membership: "bg-amber-50 text-amber-700 border-amber-200",
  general: "bg-gray-50 text-gray-600 border-gray-200",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

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

  const q = first(sp.q);
  const action = first(sp.action);
  const category = first(sp.category);
  const from = first(sp.from);
  const to = first(sp.to);
  const page = Math.max(parseInt(first(sp.page) || "1", 10) || 1, 1);

  const result = await getAuditLogs({
    page,
    perPage: AUDIT_PER_PAGE,
    action: action || null,
    category: category || null,
    search: q || null,
    from: from ? `${from}T00:00:00.000Z` : null,
    to: to ? `${to}T23:59:59.999Z` : null,
  });

  const totalPages =
    result.success ? Math.max(Math.ceil(result.total / result.perPage), 1) : 1;
  function pageHref(target: number): string {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (action) p.set("action", action);
    if (category) p.set("category", category);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (target > 1) p.set("page", String(target));
    const qs = p.toString();
    return `/dashboard/department/${id}/audit-trail${qs ? `?${qs}` : ""}`;
  }

  return (
    <DepartmentShell user={user} userId={id} active="audit-trail">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8B1A1A]/10">
            <ScrollText className="h-6 w-6 text-[#8B1A1A]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#333]">Audit Trail</h1>
            <p className="text-sm text-gray-500">
              Sign-ins, submissions, deletions, account creation and group
              membership changes.
            </p>
          </div>
        </div>

        <AuditFilters
          userId={id}
          initial={{ q, action, category, from, to }}
        />

        {!result.success ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {result.error}
          </div>
        ) : result.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
            <ScrollText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No audit events match these filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">
                      Date &amp; Time
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">User</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Category</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Action</th>
                    <th className="px-4 py-3 font-medium text-gray-600">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#333]">
                          {row.actorName || "—"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {row.actorEmail || "—"}
                        </div>
                        {row.actorRole && (
                          <div className="text-[11px] text-gray-400 uppercase tracking-wide">
                            {row.actorRole.replace(/_/g, " ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.general
                          }`}
                        >
                          {auditCategoryLabel(row.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {auditActionLabel(row.action)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {row.description || "—"}
                        {row.entityLabel && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {row.entityType === "user" ? "Account" : "Affected"}:{" "}
                            {row.entityLabel}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                Showing{" "}
                <span className="font-medium text-gray-700">
                  {(result.page - 1) * result.perPage + 1}–
                  {Math.min(result.page * result.perPage, result.total)}
                </span>{" "}
                of <span className="font-medium text-gray-700">{result.total}</span>{" "}
                event{result.total === 1 ? "" : "s"}
              </p>

              <div className="flex items-center gap-2">
                <Link
                  href={pageHref(result.page - 1)}
                  aria-disabled={result.page <= 1}
                  className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    result.page <= 1
                      ? "pointer-events-none opacity-40 text-gray-400"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </Link>
                <span className="text-xs text-gray-500">
                  Page {result.page} of {totalPages}
                </span>
                <Link
                  href={pageHref(result.page + 1)}
                  aria-disabled={result.page >= totalPages}
                  className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    result.page >= totalPages
                      ? "pointer-events-none opacity-40 text-gray-400"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </>
        )}

        <p className="mt-6 text-[11px] text-gray-400">
          Categories: {Object.values(AUDIT_CATEGORIES).join(" · ")}. Audit entries
          are append-only — they cannot be edited or deleted from the app.
        </p>
      </div>
    </DepartmentShell>
  );
}