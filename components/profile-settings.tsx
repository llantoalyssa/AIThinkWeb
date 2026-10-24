"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  getCurrentUser,
  updateProfileAvatar,
  updateProfile,
  changePassword,
  logout,
  updateSignature,
  type CurrentUser,
} from "@/server/actions/auth";
import { createClient } from "@/server/supabase/client";
import { rolePath, USER_ROLES, formatName, type UserRole } from "@/lib/constants";
import {
  Loader2,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  Camera,
  AlertCircle,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  LogOut,
  Bell,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { UserMenu } from "@/components/user-menu";
import NotificationBell from "@/components/notification-bell";
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
const NAME_DISALLOWED_RE = /[^\p{L} .'-]/gu;
const SUFFIX_DISALLOWED_RE = /[^\p{L} .,'-]/gu;
const NAME_ALLOWED_RE = /^[\p{L} .'-]+$/u;
function sanitizeName(value: string, allowComma = false): string {
  return value.replace(allowComma ? SUFFIX_DISALLOWED_RE : NAME_DISALLOWED_RE, "");
}

const NAME_ERROR =
  "Only letters are allowed (spaces, hyphen, apostrophe and period are OK)";
const SHOW_SIGNATURE_UPLOAD = false;

type NavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  badge?: number;
};

export type ProfileNavItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
  badge?: number;
};
export function ProfileSettingsPage({
  role,
  routeBase,
  navItems,
}: {
  role: UserRole;
  routeBase: string;
  navItems: ProfileNavItem[];
}) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const urlUserId = params.id;

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [signingOut, setSigningOut] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const isAffair = ["adviser", "associate_dean", "dean", "vcrdes"].includes(role);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [suffix, setSuffix] = useState("");
  const [srCodeEdit, setSrCodeEdit] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const isStudent = role === "student";
  const roleLabel = USER_ROLES[role];

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const u = await getCurrentUser();
      if (cancelled) return;
      if (!u) {
        router.replace("/login");
        return;
      }
      if (u.role !== role) {
        router.replace(`${rolePath(u.role)}/${u.id}`);
        return;
      }
      setCurrentUser(u);
      setAvatarUrl(u.avatarUrl);
      setSignatureUrl(u.signatureUrl || null);
      setFirstName(u.firstName || "");
      setLastName(u.lastName || "");
      setMiddleInitial(u.middleInitial || "");
      setSuffix(u.suffix || "");
      setSrCodeEdit(u.srCode || "");
      setLoading(false);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [router, role]);
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPG, PNG, WEBP).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB.");
      return;
    }
    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${currentUser.id}/avatar.${ext}`;
      await supabase.storage
        .from("avatars")
        .remove([
          `${currentUser.id}/avatar.jpg`,
          `${currentUser.id}/avatar.png`,
          `${currentUser.id}/avatar.webp`,
          `${currentUser.id}/avatar.jpeg`,
        ]);

      const { data, error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;

      const { data: pub } = supabase.storage
        .from("avatars")
        .getPublicUrl(data.path);
      const publicUrl = pub.publicUrl;

      const res = await updateProfileAvatar(publicUrl);
      if (!res.success) throw new Error(res.error);
      setAvatarUrl(publicUrl);
      setCurrentUser((u) => (u ? { ...u, avatarUrl: publicUrl } : u));
      toast.success("Profile picture updated.");
    } catch (err) {
      console.error("[profile] avatar upload failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to upload profile picture."
      );
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  async function handleSignaturePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Signature must be an image (PNG with transparency recommended).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Signature image must be under 2 MB.");
      return;
    }
    setUploadingSignature(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const path = `${currentUser.id}/signature.${ext}`;
      await supabase.storage
        .from("signatures")
        .remove([
          `${currentUser.id}/signature.png`,
          `${currentUser.id}/signature.jpg`,
          `${currentUser.id}/signature.jpeg`,
          `${currentUser.id}/signature.webp`,
        ]);

      const { data, error } = await supabase.storage
        .from("signatures")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;

      const { data: pub } = supabase.storage
        .from("signatures")
        .getPublicUrl(data.path);
      const publicUrl = pub.publicUrl;

      const res = await updateSignature(publicUrl);
      if (!res.success) throw new Error(res.error);
      setSignatureUrl(publicUrl);
      setCurrentUser((u) => (u ? { ...u, signatureUrl: publicUrl } : u));
      toast.success("Digital signature uploaded.");
    } catch (err) {
      console.error("[profile] signature upload failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to upload digital signature."
      );
    } finally {
      setUploadingSignature(false);
      if (signatureInputRef.current) signatureInputRef.current.value = "";
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setChangingPassword(true);
    const res = await changePassword({ currentPassword, newPassword });
    setChangingPassword(false);
    if (res.success) {
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      toast.error(res.error);
    }
  }

  async function handleSaveProfile() {
    const first = firstName.trim();
    const last = lastName.trim();

    if (!first) {
      toast.error("First name is required.");
      return;
    }
    if (!last) {
      toast.error("Last name is required.");
      return;
    }
    if (!NAME_ALLOWED_RE.test(first)) {
      toast.error(`First name: ${NAME_ERROR}`);
      return;
    }
    if (!NAME_ALLOWED_RE.test(last)) {
      toast.error(`Last name: ${NAME_ERROR}`);
      return;
    }

    setSavingProfile(true);
    const res = await updateProfile({
      firstName,
      lastName,
      middleInitial,
      suffix,
      srCode: isStudent ? srCodeEdit.trim() || undefined : undefined,
    });
    setSavingProfile(false);
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
      );
      toast.success("Profile updated successfully.");
    } else {
      toast.error(res.error);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    const res = await logout();
    setSigningOut(false);
    if (res.success) router.push("/login");
    else toast.error(res.error);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#8B1A1A]" />
      </div>
    );
  }

  const initials =
    (
      (currentUser?.firstName?.charAt(0) || "") +
      (currentUser?.lastName?.charAt(0) || "")
    ).toUpperCase() || "U";
  const displayName =
    formatName({
      firstName: currentUser?.firstName,
      middleInitial: currentUser?.middleInitial,
      lastName: currentUser?.lastName,
      suffix: currentUser?.suffix,
    }) || roleLabel;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white px-4 shadow-sm">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <h1 className="text-lg font-semibold text-[#333] flex-1">
          Profile Settings
        </h1>
        {
}
        <NotificationBell
          routerPush={(href) => router.push(href)}
          allHref={`${routeBase}/${urlUserId}/notifications`}
          hrefFor={(n) => {
            if (!n.submissionId) {
              return `${routeBase}/${urlUserId}/notifications`;
            }
            if (role === "adviser" || role === "student") {
              return n.groupName
                ? `${routeBase}/${urlUserId}/group/${slugify(n.groupName)}/submission/${n.submissionId}`
                : `${routeBase}/${urlUserId}/notifications`;
            }
            return `${routeBase}/${urlUserId}/submission/${n.submissionId}`;
          }}
        />
        <UserMenu user={currentUser} userId={urlUserId} routeBase={routeBase} />
      </header>

      {}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-20 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-white shadow-xl">
            <nav className="flex flex-col gap-1 p-3 pt-6">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    router.push(item.href);
                  }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                    item.id === "profile"
                      ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <div className="flex flex-1">
        {}
        <aside
          className={`hidden md:flex flex-col border-r bg-white transition-all duration-200 self-start sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto ${
            sidebarExpanded ? "w-56" : "w-16"
          } shrink-0`}
        >
          <nav className="flex flex-col gap-1 p-2 pt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                  item.id === "profile"
                    ? "bg-[#8B1A1A]/10 text-[#8B1A1A] font-medium"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                } ${sidebarExpanded ? "" : "justify-center"}`}
                title={item.label}
              >
                {item.icon}
                {sidebarExpanded && <span>{item.label}</span>}
                {item.badge ? (
                  <span
                    className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ${
                      sidebarExpanded ? "" : "absolute right-1.5 top-1.5"
                    }`}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            {}
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gradient-to-r from-[#8B1A1A]/5 to-transparent px-6 py-6 flex items-center gap-4">
                <div className="relative">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="h-20 w-20 rounded-full object-cover border-2 border-gray-200"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#8B1A1A]/10 text-[#8B1A1A] text-2xl font-bold">
                      {initials}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#8B1A1A] text-white shadow hover:bg-[#a32020] transition-colors cursor-pointer disabled:opacity-50"
                    title="Upload profile picture"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarPick}
                    className="hidden"
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#333]">{displayName}</h2>
                  <p className="text-sm text-gray-500">{roleLabel}</p>
                </div>
              </div>

              <div className="p-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <EditableField
                    label="First Name"
                    value={firstName}
                    onChange={setFirstName}
                    sanitize={sanitizeName}
                  />
                  <EditableField
                    label="Last Name"
                    value={lastName}
                    onChange={setLastName}
                    sanitize={sanitizeName}
                  />
                  <EditableField
                    label="Middle Initial"
                    value={middleInitial}
                    onChange={setMiddleInitial}
                    maxLength={1}
                    sanitize={(v) => v.replace(/[^A-Za-z.]/g, "").slice(0, 1)}
                  />
                  <EditableField
                    label="Suffix"
                    value={suffix}
                    onChange={setSuffix}
                    sanitize={(v) => sanitizeName(v, true)}
                  />
                  {isStudent ? (
                    currentUser?.srCode ? (
                      <DisabledField label="SR Code" value={currentUser.srCode} />
                    ) : (
                      <EditableField
                        label="SR Code"
                        value={srCodeEdit}
                        onChange={setSrCodeEdit}
                        placeholder="00-00000"
                      />
                    )
                  ) : null}
                  <DisabledField
                    label="Email Address"
                    value={currentUser?.email || "—"}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {isStudent
                      ? "GSuite email is not editable. SR Code is editable only when empty (e.g. after signing in with Google)."
                      : "Email is not editable for staff accounts."}
                  </p>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#8B1A1A] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                    Save Changes
                  </button>
                </div>
              </div>
            </div>

            {}
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8B1A1A]/10">
                  <KeyRound className="h-5 w-5 text-[#8B1A1A]" />
                </div>
                <h3 className="text-base font-semibold text-[#333]">
                  Change Password
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">
                    Current Password
                  </label>
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
                      aria-label={
                        showCurrentPassword
                          ? "Hide current password"
                          : "Show current password"
                      }
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">
                    New Password
                  </label>
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
                      aria-label={
                        showNewPassword
                          ? "Hide new password"
                          : "Show new password"
                      }
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">
                    Confirm Password
                  </label>
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
                      aria-label={
                        showConfirmPassword
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
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
                    {changingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    Update Password
                  </button>
                </div>
              </div>
            </div>

            {
}
            {SHOW_SIGNATURE_UPLOAD && isAffair && (
              <div className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8B1A1A]/10">
                    <PenLine className="h-5 w-5 text-[#8B1A1A]" />
                  </div>
                  <h3 className="text-base font-semibold text-[#333]">
                    Digital Signature
                  </h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Upload your signature image (PNG with transparent background
                  recommended). It will be used to sign approved TAFs.
                </p>
                <div className="flex items-start gap-4">
                  {signatureUrl ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <img
                        src={signatureUrl}
                        alt="Digital signature"
                        className="max-h-24 max-w-48 object-contain"
                      />
                      <p className="mt-2 text-xs text-green-600 font-medium">
                        Signature uploaded
                      </p>
                    </div>
                  ) : (
                    <div className="flex h-28 w-48 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-400">
                      No signature yet
                    </div>
                  )}
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => signatureInputRef.current?.click()}
                      disabled={uploadingSignature}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#8B1A1A] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#a32020] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {uploadingSignature ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PenLine className="h-4 w-4" />
                      )}
                      {signatureUrl ? "Replace Signature" : "Upload Signature"}
                    </button>
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleSignaturePick}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            )}

            {}
            <div className="mt-6">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {signingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Sign out
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  sanitize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
  sanitize?: (v: string) => string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </label>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(sanitize ? sanitize(e.target.value) : e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#8B1A1A]/30"
      />
    </div>
  );
}

function DisabledField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </label>
      <input
        type="text"
        value={value}
        disabled
        className="w-full rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600 cursor-not-allowed"
      />
    </div>
  );
}