"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Search } from "lucide-react";

import type { ApprovalListItem } from "@/server/actions/approval-workflow";
import { groupSlug } from "@/lib/slug";
import { HIGH_SIMILARITY_THRESHOLD } from "@/lib/constants";
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  under_review: "bg-blue-50 text-blue-700 border-blue-200",
  revisions_needed: "bg-red-50 text-red-700 border-red-200",
  approved: "bg-green-50 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  revisions_needed: "Revisions Needed",
  approved: "Approved",
};

export default function ApprovedTafTable({
  items,
  basePath,
  linkStyle = "none",
  description,
}: {
  items: ApprovalListItem[];

  basePath: string;
  linkStyle?: "group" | "flat" | "section" | "none";
  description?: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

  const years = useMemo(
    () => Array.from(new Set(items.map((a) => a.academicYear))).sort(),
    [items],
  );

  const filtered = items.filter((item) => {
    if (yearFilter !== "all" && item.academicYear !== yearFilter) return false;
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return (
      item.proposedTitle.toLowerCase().includes(needle) ||
      item.groupName.toLowerCase().includes(needle) ||
      item.studentName.toLowerCase().includes(needle)
    );
  });

  function hrefFor(item: ApprovalListItem): string | null {
    if (linkStyle === "group") {
      return `${basePath}/group/${groupSlug(item.groupName)}/submission/${item.id}?from=approved-page`;
    }

    if (linkStyle === "flat") {
      return `${basePath}/submission/${item.id}?from=approved-page`;
    }
    if (linkStyle === "section") return `${basePath}?section=submissions`;
    return null;
  }

  function openRow(item: ApprovalListItem) {
    const href = hrefFor(item);
    if (href) router.push(href);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-[#333] flex-1">Approved TAFs</h3>

        {}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, student, group…"
            className="w-56 rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
          />
        </div>

        {}
        <div className="relative">
          <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="rounded-lg border border-gray-200 pl-8 pr-8 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
          >
            <option value="all">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {description && (
        <p className="border-b bg-gray-50/60 px-4 py-2 text-xs text-gray-500">
          {description}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-16">
          {items.length === 0
            ? "No fully approved TAFs yet. Approved TAFs appear here once the VCRDES gives final approval."
            : "No approved TAFs match this search."}
        </p>
      ) : (
        <>
        {
}
        <div className="divide-y sm:hidden">
          {filtered.map((row) => {
            const href = hrefFor(row);
            return (
              <button
                key={`m-${row.id}`}
                type="button"
                onClick={() => openRow(row)}
                className={`flex w-full flex-col gap-1 px-3 py-3 text-left ${
                  href ? "cursor-pointer active:bg-gray-50" : "cursor-default"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 flex-1 text-sm font-medium leading-snug text-[#333]">
                    {row.proposedTitle || "Untitled TAF"}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      row.combinedScore >= HIGH_SIMILARITY_THRESHOLD
                        ? "bg-red-50 text-red-700"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {row.combinedScore}%
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {row.studentName}
                  {row.studentSrCode ? ` · ${row.studentSrCode}` : ""}
                </p>
                <p className="truncate text-xs text-gray-400">{row.groupName}</p>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_STYLES[row.status] || "bg-gray-50 text-gray-600"
                    }`}
                  >
                    {STATUS_LABELS[row.status] || row.status}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {new Date(row.submittedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Advisory Group</th>
                <th className="px-4 py-3">Proposed Title</th>
                <th className="px-4 py-3 text-center">Similarity</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const href = hrefFor(row);
                return (
                  <tr
                    key={row.id}
                    onClick={() => openRow(row)}
                    onMouseEnter={() => {
                      if (href) router.prefetch(href);
                    }}
                    className={`border-b last:border-0 transition-colors ${
                      href ? "hover:bg-gray-50 cursor-pointer" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-[#333]">{row.groupName}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#333] line-clamp-1 max-w-[320px]">
                        {row.proposedTitle || "Untitled TAF"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {row.studentName}
                        {row.studentSrCode ? ` · ${row.studentSrCode}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          row.combinedScore >= HIGH_SIMILARITY_THRESHOLD
                            ? "bg-red-50 text-red-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {row.combinedScore}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(row.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[row.status] || "bg-gray-50 text-gray-600"
                        }`}
                      >
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}