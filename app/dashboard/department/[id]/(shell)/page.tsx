'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { getDepartmentShell } from '@/server/actions/approver-shell'
import { type CurrentUser } from '@/server/actions/auth'
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  type DepartmentUser,
} from '@/server/actions/department'
import { setUserPermission } from '@/server/actions/permissions'
import type { PermissionChange, PermissionGroup } from '@/server/actions/permissions'
import { type Journal } from '@/server/actions/journals'
import { type FeedbackItem } from '@/server/actions/feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Plus,
  Pencil,
  Search,
  UserRound,
  ShieldAlert,
} from 'lucide-react'
import { DEPARTMENT_SECTIONS } from '../department-nav'
import { departmentItemPermission } from '@/components/nav-items'
import { USER_ROLES } from '@/lib/constants'
import UserDialog, { type UserDialogSubmit } from '@/components/department-user-dialog'
import StudentBulkUpload from '@/components/student-bulk-upload'
import DepartmentJournals from '@/components/department-journals'
import DepartmentFeedback from '@/components/department-feedback'
import DepartmentSubmissions from '@/components/department-submissions'
import SupervisorAdvisoryGroups from '@/components/supervisor-advisory-groups'
import TablePagination from '@/components/table-pagination'

// Rows per page for the Users table (client-side paging).
const USERS_PER_PAGE = 10

/** Registration year in Philippine time ("2026"), or "" when unknown. */
function registeredYear(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return String(
    new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" })).getFullYear(),
  );
}

// ── Section permissions ────────────────────────────────────────
/**
 * Does an account holding `permissions` get this in-page section?
 *
 * The map is the SAME one the side nav filters by (departmentItemPermission in
 * components/nav-items.tsx), so a section whose nav item is hidden can never
 * stay open at ?section=<id> — the two cannot drift apart. A department
 * account's ROLE DEFAULTS include every key here, so a normal account sees
 * exactly what it always did.
 *
 * `permissions === undefined` means "not resolved yet" and is PERMISSIVE on
 * purpose: a locked-out flash on every load would be worse than one paint of
 * the full console, and the server-side guards refuse the data regardless.
 */
function sectionAllowed(
  section: string,
  permissions: string[] | undefined
): boolean {
  if (permissions === undefined) return true
  const required = departmentItemPermission(section)
  return required === undefined || permissions.includes(required)
}

/**
 * Rendered in place of a section this account may not use — a NOTICE, not a
 * redirect: bouncing the URL would loop between sections when more than one
 * grant is missing, and the user needs to know why the page is empty.
 */
/** Round avatar with initials fallback, for the Users table. */
function UserAvatar({ name, url }: { name: string; url: string | null }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return url ? (
    <img
      src={url}
      alt={name}
      className="h-8 w-8 shrink-0 rounded-full border border-gray-200 object-cover"
    />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8B1A1A]/10 text-[11px] font-semibold text-[#8B1A1A]">
      {initials}
    </span>
  );
}

function SectionNoAccess({
  title,
  permission,
}: {
  title: string
  permission: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
      <ShieldAlert className="mb-3 h-8 w-8 text-gray-300" />
      <h3 className="mb-1 text-lg font-medium text-[#333]">
        No access to {title}
      </h3>
      <p className="max-w-md text-sm text-gray-500">
        This account has not been granted this page ({permission}). Ask a
        department account to grant it.
      </p>
    </div>
  )
}

export default function DepartmentDashboardPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const urlUserId = params.id

  // ── Permissions ────────────────────────────────────────────
  // The department is NOT exempt from the permission set: this account's
  // effective grants FILTER its nav and GATE its sections. Resolved by the
  // bundled shell fetch below (see getDepartmentShell), so it costs no extra
  // browser round trip. Undefined until then = permissive (see sectionAllowed).
  const [permissions, setPermissions] = useState<string[] | undefined>(undefined)

  // ── Active section ─────────────────────────────────────────
  // DERIVED from ?section= (no state, no sync effect — setState inside an
  // effect is an ESLint error in this project). The URL fully describes the
  // view, so a link from Notifications / Audit Trail opens the intended section
  // instead of whatever was clicked last.
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get('section')
  const activePage =
    sectionParam &&
    (DEPARTMENT_SECTIONS as readonly string[]).includes(sectionParam)
      ? sectionParam
      : 'users'

  // ── User state ─────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Users data ─────────────────────────────────────────────
  const [users, setUsers] = useState<DepartmentUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  // 1-based Users-table page. Kept unclamped here and clamped on read (below)
  // so nothing ever sets state from inside an effect.
  const [usersPage, setUsersPage] = useState(1)

  // First payloads for the Journals / Feedback panels, carried by the same
  // bundled mount request so switching tabs no longer fires a fetch. Undefined
  // = not supplied (query failed) → the panel falls back to its own fetch.
  const [initialJournals, setInitialJournals] = useState<Journal[] | undefined>(
    undefined,
  )
  const [initialFeedback, setInitialFeedback] = useState<
    FeedbackItem[] | undefined
  >(undefined)
  // True while the FIRST Users-tab activation is still covered by the bundled
  // shell fetch, so the re-activation effect below skips exactly that one run
  // and keeps refetching on every later return to the tab.
  const usersCoveredByShellRef = useRef(false)

  // ── Search & Filter ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  /**
   * Registration YEAR filter ("all" = every year). Options are derived from the
   * accounts actually loaded, newest first, so the list can never offer a year
   * with nothing in it.
   */
  const [yearFilter, setYearFilter] = useState<string>('all')
  /**
   * Users are split into TWO tabs. A department console lists every account in
   * the system in one table, and the students dwarf everyone else, so the staff
   * accounts (adviser, associate dean, dean, VCRDES, department) were buried
   * between pages of students. Students is the DEFAULT tab because that is the
   * everyday job; "Faculty & Staff" is everything that is not a student.
   */
  const [userTab, setUserTab] = useState<'students' | 'staff'>('students')

  // ── Dialog state ───────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingUser, setEditingUser] = useState<DepartmentUser | null>(null)
  // Bumped every time the dialog is opened. It's part of the dialog's `key`,
  // so the form (and its `submitting` flag) starts fresh on every open instead
  // of leaking the previous attempt's values.
  const [dialogSession, setDialogSession] = useState(0)
  // True when the user hit Cancel while a create request was in flight. A
  // server action can't be aborted, so when the create lands we delete the
  // account it just made — otherwise "Cancel" looks like it did nothing.
  const createCancelRef = useRef(false)

  // ── Permission layer ───────────────────────────────────────
  // The catalogue and every role's defaults come from the DATABASE (migrations
  // 053/054) and are read once per page load. The per-account overrides are read
  // when Edit is opened, so what the dialog shows is never stale.
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([])
  const [roleDefaults, setRoleDefaults] = useState<Record<string, string[]>>({})
  // EVERY account's override rows, keyed by user id — preloaded with the page
  // (getDepartmentShell → permissionConsole), so opening Edit never waits on a
  // request and the boxes are right on the dialog's first paint.
  const [overridesByUser, setOverridesByUser] = useState<
    Record<string, Record<string, boolean>>
  >({})
  // The overrides of the account currently in the dialog, copied out of the map
  // above when it opens.
  const [editingPermissionOverrides, setEditingPermissionOverrides] = useState<
    Record<string, boolean>
  >({})

  // ── Auth guard + first data load ───────────────────────────
  // ONE bundled server action (getDepartmentShell) replaces the old queued
  // chain: getCurrentUser → getAllUsers, and also carries the Journals and
  // Feedback panels' first payloads.
  useEffect(() => {
    let cancelled = false
    async function fetchShell() {
      const shell = await getDepartmentShell()
      if (cancelled) return
      if (!shell.success) {
        router.replace('/login')
        return
      }
      const u = shell.user
      if (u.role !== 'department') {
        router.replace(`/dashboard/${u.role}/${u.id}`)
        return
      }
      if (urlUserId !== u.id) {
        router.replace(`/dashboard/${u.role}/${u.id}`)
        return
      }
      usersCoveredByShellRef.current = true
      setCurrentUser(u)
      // The account's own grants — what filters the nav and gates the sections.
      setPermissions(shell.permissions)
      setUsers(shell.users)
      setUsersError(shell.usersError)
      setInitialJournals(shell.journals ?? undefined)
      setInitialFeedback(shell.feedback ?? undefined)
      setLoading(false)

      // Permission catalogue, every role's defaults and every account's
      // override rows all arrived with the shell — nothing to fetch here, so the
      // dialog is complete the instant it opens.
      setPermissionGroups(shell.permissionConsole?.groups ?? [])
      setRoleDefaults(shell.permissionConsole?.roleDefaults ?? {})
      setOverridesByUser(shell.permissionConsole?.overridesByUser ?? {})
    }
    void fetchShell()
    return () => { cancelled = true }
  }, [router, urlUserId])

  // ── Re-fetch users when the Users tab is re-activated ──────
  // The FIRST activation is already covered by the bundled shell fetch (see
  // the ref above), so this skips exactly that one run and keeps refetching on
  // every later return to the tab, as before.
  useEffect(() => {
    if (activePage !== 'users' || !currentUser) return
    // No pages.users → no user list to re-read (the section renders the
    // no-access notice instead).
    if (!sectionAllowed('users', permissions)) return
    if (usersCoveredByShellRef.current) {
      usersCoveredByShellRef.current = false
      return
    }

    let cancelled = false

    async function load() {
      setUsersLoading(true)
      setUsersError(null)
      const result = await getAllUsers()
      if (cancelled) return
      if (result.success) {
        setUsers(result.data)
      } else {
        setUsersError(result.error)
      }
      setUsersLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [activePage, currentUser, permissions])

  // ── Handlers ───────────────────────────────────────────────
  function handleNewUser() {
    setDialogMode('create')
    setEditingUser(null)
    createCancelRef.current = false
    // A new account has no override rows yet: the boxes start from the selected
    // role's defaults (read from role_default_permissions).
    setEditingPermissionOverrides({})
    setDialogSession((n) => n + 1)
    setDialogOpen(true)
  }

  /**
   * SYNCHRONOUS on purpose: every account's override rows were preloaded with
   * the page (shell.permissionConsole), so the dialog gets its data in the same
   * render that opens it. It used to await getUserPermissionState() here, which
   * is what made the checkboxes appear (unchecked) a beat after the form.
   */
  function handleEditUser(user: DepartmentUser) {
    setDialogMode('edit')
    setEditingUser(user)
    createCancelRef.current = false
    setEditingPermissionOverrides(overridesByUser[user.id] ?? {})
    setDialogSession((n) => n + 1)
    setDialogOpen(true)
  }

  /**
   * Save the permissions the department changed in the dialog.
   *
   * Only the keys the dialog reports are written. `granted: true|false` is an
   * explicit override row; `granted: null` DELETES the row, so a value that
   * matches the role default is stored as "no override" and a later role change
   * cannot leave a stale grant behind.
   */
  async function applyPermissionChanges(
    targetUserId: string,
    changes: PermissionChange[],
  ): Promise<string[]> {
    const failures: string[] = []
    for (const change of changes) {
      const saved = await setUserPermission(
        targetUserId,
        change.permission,
        change.granted,
      )
      if (!saved.success) {
        failures.push(`${change.permission} — ${saved.error}`)
      } else {
        // Keep the preloaded map in step with what was just written, so the next
        // open of this account (or of any dialog) shows the saved values
        // WITHOUT a page reload. `granted: null` deleted the row.
        setOverridesByUser((prev) => {
          const forUser = { ...(prev[targetUserId] ?? {}) }
          if (change.granted === null) delete forUser[change.permission]
          else forUser[change.permission] = change.granted
          return { ...prev, [targetUserId]: forUser }
        })
      }
    }
    return failures
  }

  // Cancel from inside the dialog. If a create is still in flight we flag it so
  // handleFormSubmit can undo the account once the request lands.
  function handleDialogCancel() {
    if (dialogMode === 'create') createCancelRef.current = true
  }

  async function handleFormSubmit(
    data: UserDialogSubmit,
  ): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
    if (dialogMode === 'create') {
      const result = await createUser(data)

      // The user cancelled while this was in flight — the server action can't
      // be aborted, so roll the created account back out again.
      if (createCancelRef.current) {
        createCancelRef.current = false
        if (result.success && result.data?.userId) {
          const undone = await deleteUser(result.data.userId)
          if (undone.success) {
            toast.info('Account creation cancelled.', {
              description: 'The pending account was removed.',
            })
          } else {
            toast.warning('Account creation was cancelled, but the account could not be removed.', {
              description: undone.error,
            })
          }
          const updated = await getAllUsers()
          if (updated.success) setUsers(updated.data)
        }
        return { success: false, cancelled: true }
      }

      if (result.success) {
        // The account exists now, so its permission deviations can be written.
        const permissionFailures = await applyPermissionChanges(
          result.data.userId,
          data.permissionChanges,
        )

        toast.success(
          result.data?.createdInactive
            ? 'User created (inactive).'
            : 'User created.',
          {
            description: result.data?.createdInactive
              ? 'No email confirmation needed — but the account is inactive because another account already holds this role.'
              : 'No email confirmation needed — they can sign in right away with the password you set.',
          },
        )
        // Refetch users after creation
        const updated = await getAllUsers()
        if (updated.success) setUsers(updated.data)
        if (permissionFailures.length > 0) {
          toast.warning('The account was created, but some permissions were not saved.', {
            description: permissionFailures.join('\n'),
          })
        }
        return { success: true }
      }
      return { success: false, error: result.error }
    } else {
      if (!editingUser) return { success: false, error: 'No user selected.' }
      const result = await updateUser(editingUser.id, {
        firstName: data.firstName,
        lastName: data.lastName,
        middleInitial: data.middleInitial || undefined,
        suffix: data.suffix || undefined,
        srCode: data.srCode,
        role: data.role,
        isActive: data.isActive,
      })
      if (result.success) {
        // Save the permissions AFTER the profile, so a role change in the same
        // save is already applied when the deviations are written.
        const permissionFailures = await applyPermissionChanges(
          editingUser.id,
          data.permissionChanges,
        )

        toast.success('User updated successfully.')
        // Refetch users after update
        const updated = await getAllUsers()
        if (updated.success) setUsers(updated.data)
        if (permissionFailures.length > 0) {
          toast.warning('The account was updated, but some permissions were not saved.', {
            description: permissionFailures.join('\n'),
          })
        }
        return { success: true }
      }
      return { success: false, error: result.error }
    }
  }

  // ── Toggle account active/disabled ─────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggleActive(user: DepartmentUser) {
    const nextActive = !user.isActive
    setTogglingId(user.id)
    const result = await updateUser(user.id, { isActive: nextActive })
    setTogglingId(null)

    if (!result.success) {
      toast.error(result.error || 'Failed to update account status.')
      return
    }

    toast.success(
      nextActive
        ? `${user.firstName} ${user.lastName}'s account is now Active.`
        : `${user.firstName} ${user.lastName}'s account has been Disabled.`
    )

    // Refetch users to reflect new status
    const updated = await getAllUsers()
    if (updated.success) setUsers(updated.data)
  }

  // ── Tab split ──────────────────────────────────────────────
  // Counts are computed over the WHOLE list (not the filtered one), so the tab
  // labels always say how many accounts live behind them.
  const tabCounts = useMemo(
    () => ({
      students: users.filter((u) => u.role === 'student').length,
      staff: users.filter((u) => u.role !== 'student').length,
    }),
    [users],
  )

  /** Switching tabs also clears the filters and returns to page 1 — done in the
   *  handler, never in an effect (set-state-in-effect fails the build here). */
  function switchUserTab(next: 'students' | 'staff') {
    setUserTab(next)
    setRoleFilter('all')
    setUsersPage(1)
  }

  // ── Filtered & searched users ──────────────────────────────
  /** Every year present in the loaded accounts, newest first. */
  const registrationYears = useMemo(() => {
    const years = new Set<string>();
    for (const user of users) {
      const year = registeredYear(user.registeredAt);
      if (year) years.add(year);
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [users]);

  const filteredUsers = useMemo(() => {
    // Only the ACTIVE tab's accounts are searched/filtered/paged.
    let result =
      userTab === 'students'
        ? users.filter((u) => u.role === 'student')
        : users.filter((u) => u.role !== 'student')

    // Role filter
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter)
    }

    // Registration year (Philippine time, matching what the office sees)
    if (yearFilter !== 'all') {
      result = result.filter((u) => registeredYear(u.registeredAt) === yearFilter)
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (u) =>
          u.srCode.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
          u.firstName.toLowerCase().includes(q) ||
          u.lastName.toLowerCase().includes(q)
      )
    }

    return result
  }, [users, roleFilter, searchQuery, userTab, yearFilter])

  // ── Pagination (derived, never stored) ─────────────────────
  // usersPage is intentionally NOT reset in an effect: set-state-in-effect is a
  // build-failing ESLint error here, and resetting would also fight the user's
  // click. Clamping on read handles a shrinking list (search/filter/delete).
  const usersTotalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / USERS_PER_PAGE)
  )
  const usersSafePage = Math.min(usersPage, usersTotalPages)
  const pagedUsers = filteredUsers.slice(
    (usersSafePage - 1) * USERS_PER_PAGE,
    usersSafePage * USERS_PER_PAGE
  )

  // ── Derived values ─────────────────────────────────────────
  const firstName = currentUser?.firstName || ''
  const lastName = currentUser?.lastName || ''
  const greeting = firstName || 'Department'

  // ── Loading screen ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN LAYOUT
  // ══════════════════════════════════════════════════════════════

  return (
    <div>
      {/* The chrome (header, side nav, mobile drawer) lives in the [id] LAYOUT
          so it survives navigation between this page and the routed pages. */}
      <div className="w-auto px-4 py-6 sm:px-6 lg:px-8">

            {/* ═══════════════════════════════════════════════════════ */}
            {/* USERS PAGE                                            */}
            {/* ═══════════════════════════════════════════════════════ */}
            {/* pages.users — the DEFAULT section, so this is the one a section
                gate can never bounce away from: the notice renders in place. */}
            {activePage === 'users' && !sectionAllowed('users', permissions) && (
              <SectionNoAccess title="Users" permission="pages.users" />
            )}
            {activePage === 'users' && sectionAllowed('users', permissions) && (
              <>
                {/* Page header */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
                      Welcome back, {greeting}!
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                      Manage all user accounts across the system.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* CSV registration is STUDENTS only — the staff tab keeps
                        the single-account dialog. */}
                    {userTab === 'students' && (
                      <StudentBulkUpload
                        onDone={async () => {
                          const refreshed = await getAllUsers()
                          if (refreshed.success) setUsers(refreshed.data)
                        }}
                      />
                    )}
                    <Button
                      onClick={handleNewUser}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New User
                    </Button>
                  </div>
                </div>

                {/* Students / Faculty & Staff — two tabs over ONE fetched list */}
                <div
                  role="tablist"
                  aria-label="Filter users by account group"
                  className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1"
                >
                  {([
                    { id: 'students' as const, label: 'Students', count: tabCounts.students },
                    { id: 'staff' as const, label: 'Faculty & Staff', count: tabCounts.staff },
                  ]).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={userTab === tab.id}
                      onClick={() => switchUserTab(tab.id)}
                      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                        userTab === tab.id
                          ? 'bg-[#8B1A1A] text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`rounded-full px-1.5 text-[11px] font-semibold ${
                          userTab === tab.id
                            ? 'bg-white/20 text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Search & Filter bar */}
                <div className="mb-6 flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder={
                        userTab === 'students'
                          ? 'Search by SR code, name, or email...'
                          : 'Search by name or email...'
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  {/* The role filter is only meaningful on the staff tab — every
                      account in the students tab holds the same role. */}
                  {userTab === 'staff' && (
                  <div className="w-full sm:w-48">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by role..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        {Object.entries(USER_ROLES)
                          // This tab IS the non-student accounts, so "Student"
                          // in its filter could only ever return an empty list.
                          .filter(([value]) => value !== 'student')
                          .map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                  {/* Registration year — useful on both tabs. */}
                  <div className="w-full sm:w-40">
                    <Select value={yearFilter} onValueChange={setYearFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Years" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {registrationYears.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Users table */}
                {usersLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
                  </div>
                ) : usersError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {usersError}
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <UserRound className="h-12 w-12 text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-[#333] mb-1">
                      {searchQuery || roleFilter !== 'all' || yearFilter !== 'all'
                        ? 'No users match your filters'
                        : userTab === 'students'
                          ? 'No student accounts yet'
                          : 'No faculty or staff accounts yet'}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      {searchQuery || roleFilter !== 'all'
                        ? 'Try adjusting your search or filter.'
                        : 'Click &ldquo;New User&rdquo; to create the first account.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 text-left">
                          {userTab === 'students' ? (
                            <>
                              <th className="px-4 py-3 font-medium text-gray-600">SR Code</th>
                              <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                              <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                              <th className="px-4 py-3 font-medium text-gray-600">Assigned Adviser</th>
                            </>
                          ) : (
                            <>
                              {/* Faculty & staff carry no SR code and no assigned
                                  adviser — the role is the column that matters. */}
                              <th className="px-4 py-3 font-medium text-gray-600">Role</th>
                              <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                              <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                            </>
                          )}
                          <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                          <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pagedUsers.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                            {userTab === 'students' ? (
                              <>
                                <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                                  {user.srCode || '—'}
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {user.email || '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="flex items-center gap-2.5">
                                    <UserAvatar
                                      name={[user.firstName, user.lastName].filter(Boolean).join(' ')}
                                      url={user.avatarUrl}
                                    />
                                    <span className="font-medium text-[#333]">
                                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                                    </span>
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {user.assignedAdviser || (
                                    <span className="text-gray-400 italic">
                                      {user.role === 'student' ? 'Not assigned' : '—'}
                                    </span>
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3">
                                  <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                    {USER_ROLES[user.role] || user.role}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  {user.email || '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="flex items-center gap-2.5">
                                    <UserAvatar
                                      name={[user.firstName, user.lastName].filter(Boolean).join(' ')}
                                      url={user.avatarUrl}
                                    />
                                    <span className="font-medium text-[#333]">
                                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                                    </span>
                                  </span>
                                </td>
                              </>
                            )}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={user.isActive}
                                  onClick={() => handleToggleActive(user)}
                                  disabled={togglingId === user.id || user.id === currentUser?.id}
                                  title={
                                    user.id === currentUser?.id
                                      ? 'You cannot disable your own account.'
                                      : user.isActive
                                        ? 'Click to disable this account'
                                        : 'Click to enable this account'
                                  }
                                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                                    user.isActive ? 'bg-green-600' : 'bg-gray-300'
                                  } ${togglingId === user.id ? 'cursor-wait' : 'cursor-pointer'}`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                      user.isActive ? 'translate-x-4' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                                <span
                                  className={`text-xs font-medium ${
                                    user.isActive ? 'text-green-700' : 'text-gray-400'
                                  }`}
                                >
                                  {user.isActive ? 'Active' : 'Disabled'}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditUser(user)}
                                disabled={user.id === currentUser?.id}
                                title={
                                  user.id === currentUser?.id
                                    ? 'You cannot edit your own account.'
                                    : 'Edit this account'
                                }
                                className="text-gray-500 hover:text-[#8B1A1A] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400"
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <TablePagination
                      page={usersSafePage}
                      perPage={USERS_PER_PAGE}
                      total={filteredUsers.length}
                      onChange={setUsersPage}
                      label="user"
                    />
                  </div>
                )}
              </>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* JOURNALS PAGE                                        */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activePage === 'journals' && !sectionAllowed('journals', permissions) && (
              <SectionNoAccess title="Journals" permission="pages.journals" />
            )}
            {activePage === 'journals' && sectionAllowed('journals', permissions) && (
              <DepartmentJournals initialJournals={initialJournals} />
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* FEEDBACK PAGE                                        */}
            {/* ═══════════════════════════════════════════════════════ */}
            {activePage === 'feedback' && !sectionAllowed('feedback', permissions) && (
              <SectionNoAccess title="Feedback" permission="pages.feedback" />
            )}
            {activePage === 'feedback' && sectionAllowed('feedback', permissions) && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl sm:text-2xl font-bold text-[#333]">
                    User Feedback
                  </h1>
                  <p className="text-sm text-gray-500 mt-1">
                    Feedback submitted by users across the system.
                  </p>
                </div>
                <DepartmentFeedback initialItems={initialFeedback} />
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* TAF SUBMISSIONS PAGE                                  */}
            {/* ═══════════════════════════════════════════════════════ */}
            {/* The department is the OPTIONAL approver: it may act on ANY
                pending approval step, so it gets the TAF Submissions surface
                the other approver roles have. Each row opens the department's
                own review route (…/submission/<id>), which is the only place
                the capability below can be used. */}
            {activePage === 'submissions' && !sectionAllowed('submissions', permissions) && (
              <SectionNoAccess title="TAF Submissions" permission="approval.participate" />
            )}
            {activePage === 'submissions' && sectionAllowed('submissions', permissions) && (
              <DepartmentSubmissions departmentId={urlUserId} />
            )}

            {/* ═══════════════════════════════════════════════════════ */}
            {/* ADVISORY GROUP PAGE                                   */}
            {/* ═══════════════════════════════════════════════════════ */}
            {/* The department is in GROUP_OWNER_ROLES (lib/roles.ts), so it
                can create and own advisory groups — this is the surface that
                makes that reachable. It is the SAME shared component the
                associate dean and dean render (no department-only copy), and
                it fetches its own data through the one bundled
                getSupervisorGroupsData() action. Its cards navigate to the
                department's own detail route, …/groups/<slug>, which Back
                returns from to ?section=groups. */}
            {activePage === 'groups' && !sectionAllowed('groups', permissions) && (
              <SectionNoAccess title="Advisory Group" permission="groups.view" />
            )}
            {activePage === 'groups' && sectionAllowed('groups', permissions) && (
              <SupervisorAdvisoryGroups
                role="department"
                userId={urlUserId}
                userName={currentUser?.firstName}
              />
            )}

      </div>


      {/* ── Footer ──────────────────────────────────────────────────── */}
      {/* ── User Dialog (Create / Edit) ─────────────────────────────── */}
      <UserDialog
        key={`${dialogMode}-${editingUser?.id ?? 'new'}-${dialogSession}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCancel={handleDialogCancel}
        mode={dialogMode}
        // Role list follows the tab the dialog was opened from: students are
        // created as students, staff accounts from the Faculty & Staff tab.
        allowedRoles={
          userTab === 'students'
            ? ['student']
            : ['adviser', 'associate_dean', 'dean', 'vcrdes', 'department']
        }
        actorRole={currentUser?.role ?? null}
        currentUserId={currentUser?.id ?? null}
        permissions={
          // Department accounts only — and never on your OWN account, which could
          // otherwise widen its own access (setUserPermission rejects it too).
          currentUser?.role === 'department' &&
          editingUser?.id !== currentUser?.id
            ? {
                groups: permissionGroups,
                roleDefaults,
                overrides: editingPermissionOverrides,
              }
            : null
        }
        initialData={
          editingUser
            ? {
                id: editingUser.id,
                firstName: editingUser.firstName,
                lastName: editingUser.lastName,
                middleInitial: editingUser.middleInitial || '',
                suffix: editingUser.suffix || '',
                srCode: editingUser.srCode,
                email: editingUser.email,
                role: editingUser.role,
                isActive: editingUser.isActive,
              }
            : undefined
        }
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
