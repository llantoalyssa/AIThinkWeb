'use client'

// ============================================================
// SupervisorAdvisoryGroups — the "Advisory Group" tab for the roles that own
// groups (associate dean, dean, department).
//
// This is a CLONE of the adviser dashboard's group page: the same welcome
// banner, the same three quick-stat cards, the same section header + filter,
// the same empty state, and — most importantly — cards built from the same
// shadcn <Card> structure with the same classes (left accent border, "Created"
// line, description, "Click to view group details", click-to-copy code chip).
//
// The ONLY additions are the two badges on each card: joined-student count and
// pending-decision count. Everything else is deliberately identical, so the
// three roles see one design.
//
// VCRDES never sees this: it is not in GROUP_OWNER_ROLES.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { groupSlug } from '@/lib/slug'
import { rolePath } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  createAdvisoryGroup,
  getAdviserGroupStudents,
  regenerateJoinCode,
  deleteAdvisoryGroup,
  removeStudentFromGroup,
  type AdvisoryGroup,
  type GroupStudent,
} from '@/server/actions/advisory-groups'
// Single bundled action — one round trip instead of four on mount.
import { getSupervisorGroupsData } from '@/server/actions/supervisor-groups'
import {
  AlertTriangle,
  Archive,
  FileText,
  FolderOpen,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserMinus,
  UserRound,
  Users,
} from 'lucide-react'

type Props = {
  /**
   * Every role that may OWN an advisory group (see GROUP_OWNER_ROLES in
   * lib/roles.ts). The department owns groups too — it is the CICS office that
   * supervises capstone students — so it renders this same component from its
   * own `?section=groups` surface. VCRDES is deliberately not here.
   */
  role: 'associate_dean' | 'dean' | 'department'
  userId: string
  /**
   * Same number the dashboard's side-nav badge shows.
   *
   * OPTIONAL: the approver roles pass the count their "TAF Submissions" badge
   * uses. The department has no such badge, so it omits this and the card falls
   * back to the pending TAFs across this role's OWN groups — the per-group
   * numbers the very same fetch below already returns.
   */
  pendingCount?: number
  /** Shown in the welcome banner, matching the adviser dashboard. */
  userName?: string
}

export default function SupervisorAdvisoryGroups({ role, userId, pendingCount, userName }: Props) {
  const router = useRouter()
  const [groups, setGroups] = useState<AdvisoryGroup[]>([])
  const [totalStudents, setTotalStudents] = useState<number | null>(null)
  // Per-group joined-student counts, keyed by group id (one query for all).
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})
  // Per-group pending-TAF counts (what the card badge shows).
  const [pendingByGroup, setPendingByGroup] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [groupFilter, setGroupFilter] = useState<'active' | 'archived'>('active')
  /** Search + creation-year filters, applied to whichever tab is open. */
  const [groupQuery, setGroupQuery] = useState('')
  const [groupYear, setGroupYear] = useState('all')

  // create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // per-group transient state
  const [roster, setRoster] = useState<Record<string, GroupStudent[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  // Card whose group is being opened (shows a spinner while the page loads).
  const [navigatingId, setNavigatingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // ONE round trip. The four queries still run in parallel, but server-side
      // inside the action — the browser waits for a single request now, which is
      // what makes opening this tab feel fast.
      const { groups: list, students, members, pending: pendingGroups } =
        await getSupervisorGroupsData()
      if (cancelled) return
      if (list.success) setGroups(list.data)
      else toast.error(list.error)
      if (students.success) setTotalStudents(students.count)
      if (members.success) setMemberCounts(members.counts)
      if (pendingGroups.success) setPendingByGroup(pendingGroups.counts)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    // Same single round trip as the initial load.
    const { groups: list, members, pending: pendingGroups } = await getSupervisorGroupsData()
    if (list.success) setGroups(list.data)
    else toast.error(list.error)
    if (members.success) setMemberCounts(members.counts)
    if (pendingGroups.success) setPendingByGroup(pendingGroups.counts)
  }, [])

  /** Creation year of a group, in Philippine time ("" when unknown). */
  const groupYearOf = (createdAt: string | null | undefined): string => {
    if (!createdAt) return ''
    const date = new Date(createdAt)
    if (Number.isNaN(date.getTime())) return ''
    return String(
      new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Manila' })).getFullYear(),
    )
  }

  const tabGroups = groups.filter((g) =>
    groupFilter === 'active' ? g.isActive : !g.isActive,
  )

  /** Years present in THIS tab, newest first. */
  const groupYears = Array.from(
    new Set(tabGroups.map((g) => groupYearOf(g.createdAt)).filter(Boolean)),
  ).sort((a, b) => Number(b) - Number(a))

  const visibleGroups = tabGroups.filter((g) => {
    if (groupYear !== 'all' && groupYearOf(g.createdAt) !== groupYear) return false
    const q = groupQuery.trim().toLowerCase()
    if (!q) return true
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description ?? '').toLowerCase().includes(q)
    )
  })

  // The "Pending TAFs" stat card. Callers that know the dashboard's pending
  // count pass it; otherwise the per-group pending numbers (already fetched in
  // the same round trip) are summed, so the card is never a misleading 0.
  const pendingTotal =
    pendingCount ?? Object.values(pendingByGroup).reduce((sum, n) => sum + n, 0)

  /** Clicking a card opens the same detail screen the adviser uses. */
  const groupHref = (group: AdvisoryGroup) =>
    `${rolePath(role)}/${userId}/groups/${groupSlug(group.name)}`

  function navigateToGroup(group: AdvisoryGroup) {
    // Show a spinner on THIS card so the click has immediate feedback, and
    // clear it if navigation somehow doesn't happen.
    setNavigatingId(group.id)
    window.setTimeout(() => setNavigatingId(null), 8000)
    router.push(groupHref(group))
  }

  function copyJoinCode(code: string) {
    void navigator.clipboard
      .writeText(code)
      .then(() => toast.success('Join code copied.'))
      .catch(() => toast.error('Could not copy — copy it manually.'))
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newGroupName.trim()
    if (trimmed.length < 3) {
      setCreateError('Group name must be at least 3 characters.')
      return
    }
    setCreatingGroup(true)
    setCreateError(null)
    const result = await createAdvisoryGroup({
      name: trimmed,
      description: newGroupDescription.trim() || undefined,
    })
    setCreatingGroup(false)
    if (result.success) {
      toast.success('Advisory group created successfully!')
      setCreateDialogOpen(false)
      setNewGroupName('')
      setNewGroupDescription('')
      setGroupFilter('active')
      await refresh()
    } else {
      setCreateError(result.error)
    }
  }

  async function toggleRoster(groupId: string) {
    if (roster[groupId]) {
      setRoster((prev) => {
        const next = { ...prev }
        delete next[groupId]
        return next
      })
      return
    }
    setBusy(groupId)
    const res = await getAdviserGroupStudents(groupId)
    setBusy(null)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    setRoster((prev) => ({ ...prev, [groupId]: res.data }))
  }

  async function handleRegenerate(groupId: string) {
    setBusy(groupId)
    const res = await regenerateJoinCode(groupId)
    setBusy(null)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    toast.success('New join code generated. The old code no longer works.')
    await refresh()
  }

  async function handleDelete(groupId: string) {
    setBusy(groupId)
    const res = await deleteAdvisoryGroup(groupId)
    setBusy(null)
    setDeletingGroupId(null)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    toast.success('Advisory group deleted.')
    await refresh()
  }

  async function handleRemoveStudent(groupId: string, studentId: string) {
    setBusy(groupId)
    const res = await removeStudentFromGroup(groupId, studentId)
    setBusy(null)
    if (!res.success) {
      toast.error(res.error)
      return
    }
    toast.success('Student removed from the group.')
    const fresh = await getAdviserGroupStudents(groupId)
    if (fresh.success) setRoster((prev) => ({ ...prev, [groupId]: fresh.data }))
    await refresh()
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8B1A1A]" />
      </div>
    )
  }

  return (
    // Same content width as the adviser dashboard's inner wrapper, so the two
    // pages line up instead of one being wider than the other.
    <div className="mx-auto mb-6 max-w-6xl">
      {/* Welcome banner — identical to the adviser dashboard's */}
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#333] sm:text-2xl">
            Welcome back{userName ? `, ${userName}` : ''}!
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your advisory groups and track student progress.
          </p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          {groupFilter === 'active' && (
            <DialogTrigger asChild>
              <Button className="bg-green-600 text-white hover:bg-green-700">
                <Plus className="mr-2 h-4 w-4" />
                Create Group
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Advisory Group</DialogTitle>
              <DialogDescription>
                Create a new group for your advisees. You can add students to this group later.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateGroup} className="space-y-4 pt-4">
              {createError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="group-name">Group Name *</Label>
                <Input
                  id="group-name"
                  placeholder="e.g., Capstone Group A"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  disabled={creatingGroup}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-description">
                  Description <span className="text-gray-400">(optional)</span>
                </Label>
                <Textarea
                  id="group-description"
                  placeholder="Short description of this advisory group... (optional)"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  disabled={creatingGroup}
                  rows={2}
                  maxLength={200}
                />
                {/* A group description is a one-or-two-line label shown on a
                    card, not an abstract — cap it and show the budget. */}
                <p className="text-right text-[11px] text-gray-400">
                  {newGroupDescription.length}/200
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={creatingGroup}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled={creatingGroup || newGroupName.trim().length < 3}
                >
                  {creatingGroup ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Group'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick Stats — same three cards, same classes */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
              <FolderOpen className="h-5 w-5 text-[#8B1A1A]" />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500">Total Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#333]">{groups.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500">Total Students</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#333]">
              {totalStudents === null ? '—' : totalStudents}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500">Pending TAFs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-[#333]">{pendingTotal}</p>
          </CardContent>
        </Card>
      </div>

      {/* Advisory Groups Grid */}
      <div className="mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#333]">
            <FolderOpen className="h-5 w-5 text-[#8B1A1A]" />
            My Advisory Groups
          </h2>
          {/* Active / Archived filter — default is Active */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              onClick={() => setGroupFilter('active')}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                groupFilter === 'active'
                  ? 'bg-white text-[#8B1A1A] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setGroupFilter('archived')}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                groupFilter === 'archived'
                  ? 'bg-white text-[#8B1A1A] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Archived
            </button>
          </div>
        </div>

        {/* Search + creation year — applied to whichever tab is open, so the
            office can find "the 2024 group" without scrolling the grid. */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={groupQuery}
              onChange={(e) => setGroupQuery(e.target.value)}
              placeholder="Search group name or description..."
              className="pl-9"
            />
          </div>
          <select
            value={groupYear}
            onChange={(e) => setGroupYear(e.target.value)}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
          >
            <option value="all">All Years</option>
            {groupYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {visibleGroups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <FolderOpen className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-[#333]">
                {groupQuery.trim() || groupYear !== 'all'
                  ? 'No advisory groups match your filters'
                  : groupFilter === 'active'
                    ? 'No active advisory groups'
                    : 'No archived advisory groups'}
              </h3>
              <p className="mb-4 max-w-sm text-sm text-gray-500">
                {groupFilter === 'active'
                  ? 'Create your first advisory group to start managing your advisees and their capstone projects.'
                  : 'Groups you archive will appear here.'}
              </p>
              {groupFilter === 'active' && (
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Group
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleGroups.map((group) => (
              <Card
                key={group.id}
                className={`group cursor-pointer transition-shadow hover:shadow-md ${
                  group.isActive
                    ? 'border-l-4 border-l-[#8B1A1A]'
                    : 'border-l-4 border-l-gray-300 opacity-90'
                }`}
                onClick={() => navigateToGroup(group)}
                // Warm the route so the click is fast instead of a cold load.
                onMouseEnter={() => router.prefetch(groupHref(group))}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="line-clamp-1 text-base font-semibold text-[#333]">
                      {group.name}
                      {/* Joined students in THIS group: count, then the person icon. */}
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 align-middle text-[10px] font-semibold text-blue-700"
                        title="Students who joined this group"
                      >
                        {memberCounts[group.id] ?? 0}
                        <UserRound className="h-3 w-3" />
                      </span>
                      {/* Pending TAFs in THIS group. */}
                      {(pendingByGroup[group.id] ?? 0) > 0 && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 align-middle text-[10px] font-semibold text-amber-700"
                          title="TAFs from this group awaiting a decision"
                        >
                          {pendingByGroup[group.id]}
                          <FileText className="h-3 w-3" />
                        </span>
                      )}
                      {!group.isActive && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          <Archive className="h-3 w-3" /> Archived
                        </span>
                      )}
                    </CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          disabled={busy === group.id || navigatingId === group.id}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                          title={navigatingId === group.id ? 'Opening group…' : 'Group actions'}
                        >
                          {busy === group.id || navigatingId === group.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4" />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleRoster(group.id)
                          }}
                        >
                          <Users className="mr-2 h-4 w-4" />
                          {roster[group.id] ? 'Hide members' : 'Members'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleRegenerate(group.id)
                          }}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          New join code
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeletingGroupId(group.id)
                          }}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="text-xs">
                    Created {new Date(group.createdAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="line-clamp-2 break-words text-sm text-gray-600">
                    {group.description || 'No description provided.'}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Users className="h-3.5 w-3.5" />
                      <span>Click to view group details</span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyJoinCode(group.joinCode)
                      }}
                      title="Click to copy join code"
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wider text-amber-600">
                        Code:
                      </span>
                      <span className="font-mono text-xs font-bold text-amber-700">
                        {group.joinCode}
                      </span>
                    </div>
                  </div>

                  {roster[group.id] && (
                    <div className="mt-3 border-t pt-3">
                      {roster[group.id].length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No students have joined this group yet.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {roster[group.id].map((s) => (
                            <li
                              key={s.studentId}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span className="min-w-0 truncate text-[#333]">
                                {[s.firstName, s.middleInitial, s.lastName]
                                  .filter(Boolean)
                                  .join(' ')}
                                {s.srCode ? (
                                  <span className="ml-1.5 text-xs text-gray-400">{s.srCode}</span>
                                ) : null}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleRemoveStudent(group.id, s.studentId)
                                }}
                                className="text-gray-400 hover:text-red-600"
                                title="Remove from group"
                              >
                                <UserMinus className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingGroupId}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingGroupId(null)
            // A dialog closed after a FAILED action used to leave Radix's
            // pointer/scroll lock on <body>, freezing every card until a manual
            // reload. Release it explicitly on every close.
            if (typeof document !== 'undefined') {
              document.body.style.pointerEvents = ''
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete Advisory Group
            </DialogTitle>
            <DialogDescription>
              This removes{' '}
              <strong>
                {groups.find((g) => g.id === deletingGroupId)?.name ?? 'this group'}
              </strong>
              , its memberships and its submission history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingGroupId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => deletingGroupId && void handleDelete(deletingGroupId)}
              disabled={busy === deletingGroupId}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {busy === deletingGroupId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
