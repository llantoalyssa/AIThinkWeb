'use client'

// ============================================================
// TablePagination — one shared pager for the department console's tables.
//
// The audit trail already pages in the URL server-side; this is for the
// client-side tables (users, journals, feedback, notifications) so every table
// in the console behaves the same way and none of them dumps every row at once.
//
// The caller owns the page state and clamps it (see the pages: a derived
// `Math.min(page, totalPages)` instead of resetting in an effect, because
// set-state-in-effect is an ESLint ERROR in this project).
// ============================================================

import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  /** 1-based, already clamped by the caller. */
  page: number
  perPage: number
  total: number
  onChange: (page: number) => void
  /** Singular noun for the count line, e.g. "user" / "entry". */
  label?: string
}

export default function TablePagination({
  page,
  perPage,
  total,
  onChange,
  label = 'entry',
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))

  // Nothing to page through — render nothing rather than a dead control.
  if (total <= perPage) return null

  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <p className="text-gray-500">
        Showing <span className="font-medium text-[#333]">{from}</span>–
        <span className="font-medium text-[#333]">{to}</span> of{' '}
        <span className="font-medium text-[#333]">{total}</span> {label}
        {total !== 1 ? 's' : ''}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="text-xs text-gray-500">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
