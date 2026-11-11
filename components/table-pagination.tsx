'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {

  page: number
  perPage: number
  total: number
  onChange: (page: number) => void

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