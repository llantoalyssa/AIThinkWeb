// ============================================================
// AuditTrailView — the Audit Trail's table, extracted from the department
// console's server page so that EVERY surface renders one table instead of a
// copy: the department's /audit-trail and the approver roles' own /audit-trail
// (an account the console granted `pages.audit`).
//
// READ-ONLY BY CONSTRUCTION. This component renders no control that can change
// a row: there is no edit, no delete and no "new entry", because the audit log
// is append-only and migration 051/057 grant SELECT only. A granted approver
// therefore sees exactly what the department sees — and can do nothing with it.
//
// Not marked "use client": it is pure presentation, so the department's SERVER
// page renders it on the server (no client fetch, no spinner) while the approver
// route passes it through the client frame as server-rendered children.
// ============================================================

import Link from "next/link";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { AUDIT_PER_PAGE, type AuditLogQuery, type AuditLogPage } from "@/server/audit";
import { AUDIT_CATEGORIES, auditActionLabel, auditCategoryLabel } from "@/lib/audit";
import AuditTrailFilters, {
  type AuditFilterValues,
} from "@/components/audit-trail-filters";

/** One fixed display timezone so server and client renders always agree. */
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

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export type AuditSearch = {
  /** 1-based page requested by the URL. */
  page: number;
  /** The five filter values, ready for the filter form. */
  filters: AuditFilterValues;
  /** The same values as a query for getAuditLogs(). */
  query: AuditLogQuery;
};

/**
 * URLSearchParams → the query the trail is read with. Shared by every caller so
 * a filter the department honours cannot be ignored by an approver's route.
 */
export function auditSearchFromParams(
  searchParams: Record<string, string | string[] | undefined>,
): AuditSearch {
  const q = first(searchParams.q);
  const action = first(searchParams.action);
  const category = first(searchParams.category);
  const from = first(searchParams.from);
  const to = first(searchParams.to);
  const page = Math.max(parseInt(first(searchParams.page) || "1", 10) || 1, 1);

  return {
    page,
    filters: { q, action, category, from, to },
    query: {
      page,
      perPage: AUDIT_PER_PAGE,
      action: action || null,
      category: category || null,
      search: q || null,
      from: from ? `${from}T00:00:00.000Z` : null,
      to: to ? `${to}T23:59:59.999Z` : null,
    },
  };
}

export default function AuditTrailView({
  result,
  basePath,
  filters,
  description = "Sign-ins, submissions, deletions, account creation and group membership changes.",
}: {
  result: AuditLogPage;
  /** THIS trail's route — pagination and filters stay inside the caller's role. */
  basePath: string;
  filters: AuditFilterValues;
  description?: string;
}) {
  const totalPages =
    result.success ? Math.max(Math.ceil(result.total / result.perPage), 1) : 1;

  /** Current filters + a page number → link that keeps the filters applied. */
  function pageHref(target: number): string {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.action) p.set("action", filters.action);
    if (filters.category) p.set("category", filters.category);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    if (target > 1) p.set("page", String(target));
    const qs = p.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  /**
   * Newest first, unconditionally.
   *
   * The query already asks for `created_at DESC`, but Postgres `now()` is the
   * TRANSACTION time: rows written by one action (bulk delete, an approval that
   * logs two events) share a timestamp, and ties come back in arbitrary order —
   * which reads as "the trail is not sorted". Sorting here makes the visible
   * order deterministic instead of relying on the planner.
   */
  const rows = result.success
    ? [...result.rows].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    : [];

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8B1A1A]/10">
          <ScrollText className="h-6 w-6 text-[#8B1A1A]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#333]">Audit Trail</h1>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>

      <AuditTrailFilters basePath={basePath} initial={filters} />

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
          {/* Phones: a card per event. The table needs ~900px; on a phone it
              scrolled sideways and the action, the person and the description
              were never visible together. */}
          <div className="divide-y rounded-xl border bg-white sm:hidden">
            {rows.map((row) => (
              <div key={`m-${row.id}`} className="px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[#333]">
                    {auditActionLabel(row.action)}
                  </p>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {fmtDateTime(row.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {row.actorName || "—"}
                  {row.actorEmail ? ` · ${row.actorEmail}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      CATEGORY_STYLE[row.category] ?? CATEGORY_STYLE.general
                    }`}
                  >
                    {auditCategoryLabel(row.category)}
                  </span>
                  {row.actorRole && (
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      {row.actorRole.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                {row.description && (
                  <p className="mt-1 line-clamp-3 text-xs text-gray-600">
                    {row.description}
                  </p>
                )}
                {row.entityLabel && (
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {row.entityType === "user" ? "Account" : "Affected"}:{" "}
                    {row.entityLabel}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border bg-white sm:block">
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
                {rows.map((row) => (
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
    </>
  );
}
