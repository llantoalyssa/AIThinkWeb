'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getPendingApprovals,
  type ApprovalListItem,
} from '@/server/actions/approval-workflow'
import TablePagination from '@/components/table-pagination'
import { Loader2, Inbox, ChevronRight } from 'lucide-react'
const SUBMISSIONS_PER_PAGE = 10
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  under_review: 'bg-blue-50 text-blue-700 border-blue-200',
  revisions_needed: 'bg-red-50 text-red-700 border-red-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  revisions_needed: 'Revisions Needed',
  approved: 'Approved',
}
const STEP_LABELS: Record<string, string> = {
  adviser: 'Adviser',
  associate_dean: 'Associate Dean',
  dean: 'Dean',
  vcrdes: 'VCRDES',
}

export default function DepartmentSubmissions({
  departmentId,
}: {
  departmentId: string
}) {
  const router = useRouter()

  const [pending, setPending] = useState<ApprovalListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const pendingResult = await getPendingApprovals()
      if (cancelled) return

      if (pendingResult.success) setPending(pendingResult.data)
      setError(pendingResult.success ? null : pendingResult.error)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])
  const rows = pending
  const totalPages = Math.max(1, Math.ceil(rows.length / SUBMISSIONS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pagedRows = useMemo(
    () =>
      rows.slice(
        (safePage - 1) * SUBMISSIONS_PER_PAGE,
        safePage * SUBMISSIONS_PER_PAGE,
      ),
    [rows, safePage],
  )
  function submissionHref(id: string): string {
    return `/dashboard/department/${departmentId}/submission/${id}`
  }

  const isEmpty = rows.length === 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
          TAF Submissions
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          TAFs awaiting an approval decision. The department may act on any step
          of the approval chain; finished records live on Approved TAF.
        </p>
      </div>

      {
}
      <div className="mb-4 inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm">
        <Inbox className="h-4 w-4 text-[#8B1A1A]" />
        <span className="font-medium text-[#8B1A1A]">Pending</span>
        {!loading && <span className="text-xs text-gray-400">{pending.length}</span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-[#333] mb-1">No pending TAFs</h3>
          <p className="text-sm text-gray-500">
            No TAF is currently waiting on an approval decision.
          </p>
        </div>
      ) : (
        <>
        {

}
        <div className="space-y-2 md:hidden">
          {pagedRows.map((row) => {
            const step = row.currentApproverRole
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => router.push(submissionHref(row.id))}
                className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 flex-1 text-sm font-medium text-[#333]">
                    {row.proposedTitle}
                  </p>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_STYLES[row.status] || 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    {STATUS_LABELS[row.status] || row.status}
                  </span>
                  {step ? (
                    <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                      {STEP_LABELS[step] ?? step}
                    </span>
                  ) : null}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-500">
                  <div className="min-w-0">
                    <dt className="text-gray-400">Student</dt>
                    <dd className="truncate">{row.studentName}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-gray-400">Advisory Group</dt>
                    <dd className="truncate">{row.groupName || '—'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-gray-400">Submitted</dt>
                    <dd>{new Date(row.submittedAt).toLocaleDateString()}</dd>
                  </div>
                </dl>
              </button>
            )
          })}
        </div>

        <div className="hidden overflow-x-auto rounded-lg border bg-white md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">
                  Proposed Title
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Student</th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  Advisory Group
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">
                  Current Step
                </th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 font-medium text-gray-600 text-right">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagedRows.map((row) => {
                const step = row.currentApproverRole
                return (
                  <tr
                    key={row.id}
                    onClick={() => router.push(submissionHref(row.id))}
                    onMouseEnter={() => router.prefetch(submissionHref(row.id))}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#333] line-clamp-1 max-w-[320px]">
                        {row.proposedTitle}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(row.submittedAt).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.studentName}
                      {row.studentSrCode ? (
                        <span className="block text-xs text-gray-400">
                          {row.studentSrCode}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.groupName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {step ? (
                        (STEP_LABELS[step] ?? step)
                      ) : (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[row.status] || 'bg-gray-50 text-gray-600'
                        }`}
                      >
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-gray-300 inline-block" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={safePage}
          perPage={SUBMISSIONS_PER_PAGE}
          total={rows.length}
          onChange={setPage}
          label="TAF"
        />
        </>
      )}
    </div>
  )
}