'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { getDepartmentShell } from '@/server/actions/approver-shell'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import { type CurrentUser } from '@/server/actions/auth'
import { UserMenu } from '@/components/user-menu'
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
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Plus,
  Pencil,
  Search,
  UserRound,
  ShieldAlert,
} from 'lucide-react'
import NotificationBell from '@/components/notification-bell'
import {
  departmentNotificationsHref,
  DEPARTMENT_SECTIONS,
} from './department-nav'
import { navItemsFor, departmentItemPermission } from '@/components/nav-items'
import { USER_ROLES } from '@/lib/constants'
import UserDialog, { type UserDialogSubmit } from '@/components/department-user-dialog'
import StudentBulkUpload from '@/components/student-bulk-upload'
import DepartmentJournals from '@/components/department-journals'
import DepartmentFeedback from '@/components/department-feedback'
import DepartmentSubmissions from '@/components/department-submissions'
import SupervisorAdvisoryGroups from '@/components/supervisor-advisory-groups'
import TablePagination from '@/components/table-pagination'
const USERS_PER_PAGE = 10
function sectionAllowed(
  section: string,
  permissions: string[] | undefined
): boolean {
  if (permissions === undefined) return true
  const required = departmentItemPermission(section)
  return required === undefined || permissions.includes(required)
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
  const [permissions, setPermissions] = useState<string[] | undefined>(undefined)
  const navItems = navItemsFor({
    role: 'department',
    userId: urlUserId,
    permissions,
  })
  const notificationsHref = departmentNotificationsHref(urlUserId)
  const unreadCount = useUnreadNotifications(urlUserId)
  function goToNavItem(item: { id: string; href?: string }) {
    if (!item.href) return
    if (item.href.includes('?section=')) {
      router.replace(item.href, { scroll: false })
    } else {
      router.push(item.href)
    }
  }
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get('section')
  const activePage =
    sectionParam &&
    (DEPARTMENT_SECTIONS as readonly string[]).includes(sectionParam)
      ? sectionParam
      : 'users'
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<DepartmentUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [usersPage, setUsersPage] = useState(1)
  const [initialJournals, setInitialJournals] = useState<Journal[] | undefined>(
    undefined,
  )
  const [initialFeedback, setInitialFeedback] = useState<
    FeedbackItem[] | undefined
  >(undefined)
  const usersCoveredByShellRef = useRef(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [userTab, setUserTab] = useState<'students' | 'staff'>('students')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingUser, setEditingUser] = useState<DepartmentUser | null>(null)
  const [dialogSession, setDialogSession] = useState(0)
  const createCancelRef = useRef(false)
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([])
  const [roleDefaults, setRoleDefaults] = useState<Record<string, string[]>>({})
  const [overridesByUser, setOverridesByUser] = useState<
    Record<string, Record<string, boolean>>
  >({})
  const [editingPermissionOverrides, setEditingPermissionOverrides] = useState<
    Record<string, boolean>
  >({})
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

      setPermissions(shell.permissions)
      setUsers(shell.users)
      setUsersError(shell.usersError)
      setInitialJournals(shell.journals ?? undefined)
      setInitialFeedback(shell.feedback ?? undefined)
      setLoading(false)
      setPermissionGroups(shell.permissionConsole?.groups ?? [])
      setRoleDefaults(shell.permissionConsole?.roleDefaults ?? {})
      setOverridesByUser(shell.permissionConsole?.overridesByUser ?? {})
    }
    void fetchShell()
    return () => { cancelled = true }
  }, [router, urlUserId])
  useEffect(() => {
    if (activePage !== 'users' || !currentUser) return
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
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  function handleNewUser() {
    setDialogMode('create')
    setEditingUser(null)
    createCancelRef.current = false
    setEditingPermissionOverrides({})
    setDialogSession((n) => n + 1)
    setDialogOpen(true)
  }
  function handleEditUser(user: DepartmentUser) {
    setDialogMode('edit')
    setEditingUser(user)
    createCancelRef.current = false
    setEditingPermissionOverrides(overridesByUser[user.id] ?? {})
    setDialogSession((n) => n + 1)
    setDialogOpen(true)
  }
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
  function handleDialogCancel() {
    if (dialogMode === 'create') createCancelRef.current = true
  }

  async function handleFormSubmit(
    data: UserDialogSubmit,
  ): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
    if (dialogMode === 'create') {
      const result = await createUser(data)
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
        const permissionFailures = await applyPermissionChanges(
          editingUser.id,
          data.permissionChanges,
        )

        toast.success('User updated successfully.')

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
    const updated = await getAllUsers()
    if (updated.success) setUsers(updated.data)
  }
  const tabCounts = useMemo(
    () => ({
      students: users.filter((u) => u.role === 'student').length,
      staff: users.filter((u) => u.role !== 'student').length,
    }),
    [users],
  )
  function switchUserTab(next: 'students' | 'staff') {
    setUserTab(next)
    setRoleFilter('all')
    setUsersPage(1)
  }
  const filteredUsers = useMemo(() => {

    let result =
      userTab === 'students'
        ? users.filter((u) => u.role === 'student')
        : users.filter((u) => u.role !== 'student')
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter)
    }
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
  }, [users, roleFilter, searchQuery, userTab])
  const usersTotalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / USERS_PER_PAGE)
  )
  const usersSafePage = Math.min(usersPage, usersTotalPages)
  const pagedUsers = filteredUsers.slice(
    (usersSafePage - 1) * USERS_PER_PAGE,
    usersSafePage * USERS_PER_PAGE
  )
  const firstName = currentUser?.firstName || ''
  const lastName = currentUser?.lastName || ''
  const greeting = firstName || 'Department'
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    )
  }
  return (
    <div className="flex min-h-screen flex-col bg-gray-50/50">
      {}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        {}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <h1 className="text-lg font-semibold text-[#333] flex-1">
          AIThink
        </h1>

        {}
        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={notificationsHref}
          hrefFor={() => null}
        />

        {}
        <UserMenu user={currentUser} userId={urlUserId} routeBase="/dashboard/department" />
      </header>

      <div className="flex flex-1 relative">
        {}
        <aside
          className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${
            sidebarExpanded ? 'w-64' : 'w-16'
          } shrink-0`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => goToNavItem(item)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activePage === item.id
                    ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                } ${sidebarExpanded ? '' : 'justify-center'} cursor-pointer`}
                title={item.label}
              >
                {item.icon}
                {sidebarExpanded && <span className="flex-1 text-left truncate">{item.label}</span>}
                {sidebarExpanded && item.id === 'notifications' && unreadCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8B1A1A] text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-20 md:hidden">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="absolute left-0 top-14 bottom-0 z-40 w-64 overflow-y-auto bg-white shadow-xl">
              <nav className="flex flex-col gap-1 p-3 pt-6">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMobileMenuOpen(false)
                      goToNavItem(item)
                    }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      activePage === item.id
                        ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    } cursor-pointer`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.id === 'notifications' && unreadCount > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#8B1A1A] text-[10px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {}
        <main className="flex-1 overflow-auto pb-mobile-nav">
          <div className="w-auto px-4 py-6 sm:px-6 lg:px-8">

            {}
            {}
            {}
            {
}
            {activePage === 'users' && !sectionAllowed('users', permissions) && (
              <SectionNoAccess title="Users" permission="pages.users" />
            )}
            {activePage === 'users' && sectionAllowed('users', permissions) && (
              <>
                {}
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
                    {
}
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

                {}
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

                {}
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
                  {
}
                  {userTab === 'staff' && (
                  <div className="w-full sm:w-48">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by role..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        {Object.entries(USER_ROLES)
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
                </div>

                {}
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
                      {searchQuery || roleFilter !== 'all'
                        ? 'No users match your search'
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
                              {
}
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
                                  <span className="font-medium text-[#333]">
                                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
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
                                  <span className="font-medium text-[#333]">
                                    {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
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

            {}
            {}
            {}
            {activePage === 'journals' && !sectionAllowed('journals', permissions) && (
              <SectionNoAccess title="Journals" permission="pages.journals" />
            )}
            {activePage === 'journals' && sectionAllowed('journals', permissions) && (
              <DepartmentJournals initialJournals={initialJournals} />
            )}

            {}
            {}
            {}
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

            {}
            {}
            {}
            {
}
            {activePage === 'submissions' && !sectionAllowed('submissions', permissions) && (
              <SectionNoAccess title="TAF Submissions" permission="approval.participate" />
            )}
            {activePage === 'submissions' && sectionAllowed('submissions', permissions) && (
              <DepartmentSubmissions departmentId={urlUserId} />
            )}

            {}
            {}
            {}
            {
}
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
        </main>
      </div>

      {}
      <nav className="md:hidden flex items-center gap-1 overflow-x-auto border-t bg-white px-2 py-1 safe-area-bottom">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => goToNavItem(item)}
            className={`flex shrink-0 flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${
              activePage === item.id
                ? 'text-[#8B1A1A]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="relative">
              {item.icon}
              {item.id === 'notifications' && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            <span className="text-[10px]">{item.label}</span>
          </button>
        ))}
      </nav>

      {}
      <footer className="hidden md:block bg-[#8B1A1A] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>

      {}
      <UserDialog
        key={`${dialogMode}-${editingUser?.id ?? 'new'}-${dialogSession}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCancel={handleDialogCancel}
        mode={dialogMode}
        actorRole={currentUser?.role ?? null}
        currentUserId={currentUser?.id ?? null}
        permissions={
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