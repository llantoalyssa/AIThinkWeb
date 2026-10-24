'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { updateProfileAvatar, updateProfile, changePassword, logout, type CurrentUser } from '@/server/actions/auth'
import { createClient } from '@/server/supabase/client'
import { formatName } from '@/lib/constants'
import { useUnreadNotifications } from '@/hooks/use-unread-notifications'
import {
  LogOut, User, Loader2, Menu, X, ChevronLeft, ChevronRight,
  Home, FilePlus, Users, Star, Bell, Camera, AlertCircle, Mail, KeyRound, Eye, EyeOff,
} from 'lucide-react'
import { toast } from 'sonner'

type NavItem = {
  id: string
  icon: React.ReactNode
  label: string
  href: string
  badge?: number
}

type Props = {
  /** Supplied by the SERVER (see page.tsx). Identity and the notification badge
   *  arrive with the first render, so this page fires no data round trips on
   *  mount — it used to fire two, one after the other. */
  initialUser: CurrentUser;
  initialUnreadCount: number;
};

export default function StudentProfileSettingsPage({
  initialUser,
  initialUnreadCount,
}: Props) {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const urlUserId = params.id

  // Identity comes from the server; the role guard already ran in page.tsx.
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(initialUser)
  const loading = false
  const unreadCount = useUnreadNotifications(urlUserId, initialUnreadCount)

  // sidebar / ui state
  const [signingOut, setSigningOut] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // avatar state — seeded from the server-supplied user
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUser.avatarUrl)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // password state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // editable profile state (First/Last/Middle/Suffix; SR code only when empty —
// Google sign-in users fill it in manually; email is never editable)
  const [firstName, setFirstName] = useState(initialUser.firstName || '')
  const [lastName, setLastName] = useState(initialUser.lastName || '')
  const [middleInitial, setMiddleInitial] = useState(initialUser.middleInitial || '')
  const [suffix, setSuffix] = useState(initialUser.suffix || '')
  const [srCodeEdit, setSrCodeEdit] = useState(initialUser.srCode || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const navItems: NavItem[] = [
    { id: 'dashboard', icon: <Home className="h-5 w-5" />, label: 'Dashboard', href: `/dashboard/student/${urlUserId}` },
    { id: 'taf', icon: <FilePlus className="h-5 w-5" />, label: 'Topic Abstract Form', href: `/dashboard/student/${urlUserId}/taf` },
    { id: 'advisory-group', icon: <Users className="h-5 w-5" />, label: 'Advisory Group', href: `/dashboard/student/${urlUserId}/group` },
    { id: 'feedback', icon: <Star className="h-5 w-5" />, label: 'Feedback', href: `/dashboard/student/${urlUserId}/feedback` },
    { id: 'notifications', icon: <Bell className="h-5 w-5" />, label: 'Notifications', href: `/dashboard/student/${urlUserId}/notifications`, badge: unreadCount },
  ]

  // Identity, the avatar and the editable fields are seeded from the
  // server-supplied user (see page.tsx) — the load effect that used to
  // populate them (and the role guard in front of it) is gone.

  // outside click for user menu
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentUser) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG, PNG, WEBP).')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB.')
      return
    }
    setUploadingAvatar(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${currentUser.id}/avatar.${ext}`
      // remove any prior avatar to avoid orphan files
      await supabase.storage.from('avatars').remove([`${currentUser.id}/avatar.jpg`, `${currentUser.id}/avatar.png`, `${currentUser.id}/avatar.webp`, `${currentUser.id}/avatar.jpeg`])

      const { data, error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (error) throw error

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(data.path)
      const publicUrl = pub.publicUrl

      const res = await updateProfileAvatar(publicUrl)
      if (!res.success) throw new Error(res.error)
      setAvatarUrl(publicUrl)
      setCurrentUser((u) => (u ? { ...u, avatarUrl: publicUrl } : u))
      toast.success('Profile picture updated.')
    } catch (err) {
      console.error('[profile] avatar upload failed:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to upload profile picture.')
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match.')
      return
    }
    setChangingPassword(true)
    const res = await changePassword({ currentPassword, newPassword })
    setChangingPassword(false)
    if (res.success) {
      toast.success('Password changed successfully.')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } else {
      toast.error(res.error)
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true)
    const res = await updateProfile({
      firstName,
      lastName,
      middleInitial,
      suffix,
      // Only meaningful when the current SR code is empty (Google sign-in);
      // the server ignores it if the profile already has an SR code.
      srCode: srCodeEdit.trim() || undefined,
    })
    setSavingProfile(false)
    if (res.success) {
      setCurrentUser((u) =>
        u
          ? {
              ...u,
              firstName,
              lastName,
              middleInitial: middleInitial || null,
              suffix: suffix || null,
              srCode: u.srCode || srCodeEdit.trim() || u.srCode,
            }
          : u
      )
      toast.success('Profile updated successfully.')
    } else {
      toast.error(res.error)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    const res = await logout()
    setSigningOut(false)
    if (res.success) router.push('/login')
    else toast.error(res.error)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    )
  }

  const initials = ((currentUser?.firstName?.charAt(0) || '') + (currentUser?.lastName?.charAt(0) || '')).toUpperCase() || 'U'
  const displayName = formatName({
    firstName: currentUser?.firstName,
    middleInitial: currentUser?.middleInitial,
    lastName: currentUser?.lastName,
    suffix: currentUser?.suffix,
  }) || 'Student'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
          <Menu className="h-5 w-5" />
        </button>
        <button onClick={() => setSidebarExpanded(!sidebarExpanded)} className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          {sidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <h1 className="text-lg font-semibold text-[#333] flex-1">Profile Settings</h1>
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8B1A1A] text-white text-sm font-semibold hover:bg-[#a32020] transition-colors overflow-hidden"
            title={displayName || 'User'}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-12 w-56 rounded-lg border bg-white shadow-lg z-50">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push(`/dashboard/student/${urlUserId}/profile`);
                }}
                className="w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <p className="text-sm font-medium text-[#333] truncate">{displayName || 'User'}</p>
                <p className="text-xs text-gray-500 truncate">{currentUser?.email}</p>
              </button>
              <div className="py-1">
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  {signingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${sidebarExpanded ? 'w-56' : 'w-16'} shrink-0`}>
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  item.id === 'profile' ? 'bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                } ${sidebarExpanded ? '' : 'justify-center'} cursor-pointer`}
                title={item.label}
              >
                {item.icon}
                {sidebarExpanded && <span>{item.label}</span>}
                {item.badge ? (
                  <span className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ${sidebarExpanded ? '' : 'absolute right-1.5 top-1.5'}`}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            {/* ── Profile card ────────────────────────────────── */}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gradient-to-r from-[#8B1A1A]/5 to-transparent px-6 py-6 flex items-center gap-4">
                <div className="relative">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="h-20 w-20 rounded-full object-cover border-2 border-gray-200" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8B1A1A]/10 text-[#8B1A1A] text-2xl font-bold">{initials}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#8B1A1A] text-white shadow hover:bg-[#a32020] transition-colors cursor-pointer disabled:opacity-50"
                    title="Upload profile picture"
                  >
                    {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarPick} className="hidden" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#333]">{displayName}</h2>
                  <p className="text-sm text-gray-500">Student</p>
                </div>
              </div>

              <div className="p-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Personal Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <EditableField
                    label="First Name"
                    value={firstName}
                    onChange={setFirstName}
                  />
                  <EditableField
                    label="Last Name"
                    value={lastName}
                    onChange={setLastName}
                  />
                  <EditableField
                    label="Middle Initial"
                    value={middleInitial}
                    onChange={setMiddleInitial}
                    maxLength={1}
                  />
                  <EditableField
                    label="Suffix"
                    value={suffix}
                    onChange={setSuffix}
                  />
                  {currentUser?.srCode ? (
                    <DisabledField label="SR Code" value={currentUser.srCode} />
                  ) : (
                    <EditableField
                      label="SR Code"
                      value={srCodeEdit}
                      onChange={setSrCodeEdit}
                      placeholder="00-00000"
                    />
                  )}
                  <DisabledField label="GSuite Email Address" value={currentUser?.email || '—'} />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> GSuite email is not editable. SR Code is editable only when empty (e.g. after signing in with Google).
                  </p>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8B1A1A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                    Save Changes
                  </button>
                </div>
              </div>
            </div>

            {/* ── Change password ─────────────────────────────── */}
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8B1A1A]/10">
                  <KeyRound className="h-5 w-5 text-[#8B1A1A]" />
                </div>
                <h3 className="text-base font-semibold text-[#333]">Change Password</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8B1A1A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Update Password
                  </button>
                </div>
              </div>
            </div>

            {/* ── Sign out ────────────────────────────────────── */}
            <div className="mt-6">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Sign out
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function EditableField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
      />
    </div>
  );
}

function DisabledField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        disabled
        className="w-full rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600 cursor-not-allowed"
      />
    </div>
  );
}