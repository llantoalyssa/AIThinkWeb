"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, RotateCcw, Search } from "lucide-react";

import { AUDIT_CATEGORIES, auditActionOptions } from "@/lib/audit";
export type AuditFilterValues = {
  q: string;
  action: string;
  category: string;
  from: string;
  to: string;
};

type Props = {

  basePath: string;
  initial: AuditFilterValues;
};

const ACTION_OPTIONS = auditActionOptions();

export default function AuditTrailFilters({ basePath, initial }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [action, setAction] = useState(initial.action);
  const [category, setCategory] = useState(initial.category);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const base = basePath;

  function apply(overrides: Partial<{ page: string }> = {}) {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (action) p.set("action", action);
    if (category) p.set("category", category);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (overrides.page && overrides.page !== "1") p.set("page", overrides.page);
    const qs = p.toString();
    router.push(`${base}${qs ? `?${qs}` : ""}`);
  }

  function reset() {
    setQ("");
    setAction("");
    setCategory("");
    setFrom("");
    setTo("");
    router.push(base);
  }
  const actionOptions = category
    ? ACTION_OPTIONS.filter((o) => o.category === category)
    : ACTION_OPTIONS;

  const hasFilters = !!(q || action || category || from || to);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="mb-4 rounded-xl border bg-white p-3"
    >
      {

}
      <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
        <div className="col-span-2 min-w-0 sm:flex-1 sm:min-w-[220px]">
          <label
            htmlFor="audit-q"
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400"
          >
            Search user or description
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="audit-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. juan, submitted, BaleteGo"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-[#333] focus:border-[#8B1A1A] focus:outline-none"
            />
          </div>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="audit-category"
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400"
          >
            Category
          </label>
          <select
            id="audit-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setAction("");
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#333] focus:border-[#8B1A1A] focus:outline-none"
          >
            <option value="">All categories</option>
            {Object.entries(AUDIT_CATEGORIES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="audit-action"
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400"
          >
            Action
          </label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#333] focus:border-[#8B1A1A] focus:outline-none sm:max-w-[220px]"
          >
            <option value="">All actions</option>
            {actionOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="audit-from"
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400"
          >
            From
          </label>
          <input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#333] focus:border-[#8B1A1A] focus:outline-none"
          />
        </div>

        <div className="min-w-0">
          <label
            htmlFor="audit-to"
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400"
          >
            To
          </label>
          <input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#333] focus:border-[#8B1A1A] focus:outline-none"
          />
        </div>

        {}
        <div className="col-span-2 flex gap-2 sm:contents">
        <button
          type="submit"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#8B1A1A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a32020] cursor-pointer sm:flex-none"
        >
          <Filter className="h-3.5 w-3.5" />
          Filter
        </button>

        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
        </div>
      </div>
    </form>
  );
}