'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { getDepartmentShell } from '@/server/actions/approver-shell'
import { type CurrentUser } from '@/server/actions/auth'
import { UserMenu } from '@/components/user-menu'
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  type DepartmentUser,
} from '@/server/actions/department'
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
} from 'lucide-react'
import NotificationBell from '@/components/notification-bell'
import {
  departmentNav,
  departmentNotificationsHref,
  DEPARTMENT_SECTIONS,
} from './department-nav'
import { USER_ROLES, type UserRole } from '@/lib/constants'
import UserDialog from '@/components/department-user-dialog'
import DepartmentJournals from '@/components/department-journals'
import DepartmentFeedback from '@/components/department-feedback'

export default function DepartmentDashboardPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const urlUserId = params.id
  const navItems = departmentNav(urlUserId)
  const notificationsHref = departmentNotificationsHref(urlUserId)
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
  const [initialJournals, setInitialJournals] = useState<Journal[] | undefined>(
    undefined,
  )
  const [initialFeedback, setInitialFeedback] = useState<
    FeedbackItem[] | undefined
  >(undefined)
  const usersCoveredByShellRef = useRef(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingUser, setEditingUser] = useState<DepartmentUser | null>(null)
  const [dialogSession, setDialogSession] = useState(0)
  const createCancelRef = useRef(false)
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
      setUsers(shell.users)
      setUsersError(shell.usersError)
      setInitialJournals(shell.journals ?? undefined)
      setInitialFeedback(shell.feedback ?? undefined)
      setLoading(false)
    }
    void fetchShell()
    return () => { cancelled = true }
  }, [router, urlUserId])
  useEffect(() => {
    if (activePage !== 'users' || !currentUser) return
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
  }, [activePage, currentUser])
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
    setDialogSession((n) => n + 1)
    setDialogOpen(true)
  }

  function handleEditUser(user: DepartmentUser) {
    setDialogMode('edit')
    setEditingUser(user)
    createCancelRef.current = false
    setDialogSession((n) => n + 1)
    setDialogOpen(true)
  }
  function handleDialogCancel() {
    if (dialogMode === 'create') createCancelRef.current = true
  }

  async function handleFormSubmit(data: {
    firstName: string
    lastName: string
    middleInitial: string
    suffix: string
    srCode: string
    email: string
    password: string
    role: UserRole
    isActive: boolean
  }): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
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
        toast.success('User updated successfully.')

        const updated = await getAllUsers()
        if (updated.success) setUsers(updated.data)
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
  const filteredUsers = useMemo(() => {
    let result = users
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
  }, [users, roleFilter, searchQuery])
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
            sidebarExpanded ? 'w-48' : 'w-16'
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
                {sidebarExpanded && <span>{item.label}</span>}
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
            <aside className="absolute left-0 top-0 bottom-0 w-56 overflow-y-auto bg-white shadow-xl">
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
                  </button>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {}
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">

            {}
            {}
            {}
            {activePage === 'users' && (
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
                  <Button
                    onClick={handleNewUser}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New User
                  </Button>
                </div>

                {}
                <div className="mb-6 flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by SR code, name, or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by role..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        {Object.entries(USER_ROLES).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                        : 'No users found'}
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
                          <th className="px-4 py-3 font-medium text-gray-600">SR Code</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Name</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Assigned Adviser</th>
                          <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                          <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredUsers.map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
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
                    {}
                    <div className="border-t bg-gray-50/50 px-4 py-2 text-xs text-gray-400">
                      Showing {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                )}
              </>
            )}

            {}
            {}
            {}
            {activePage === 'journals' && (
              <DepartmentJournals initialJournals={initialJournals} />
            )}

            {}
            {}
            {}
            {activePage === 'feedback' && (
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

          </div>
        </main>
      </div>

      {}
      <nav className="md:hidden flex items-center justify-around border-t bg-white px-2 py-1 safe-area-bottom">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => goToNavItem(item)}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${
              activePage === item.id
                ? 'text-[#8B1A1A]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {item.icon}
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