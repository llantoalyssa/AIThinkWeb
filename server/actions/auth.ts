"use server";

import { cache } from "react";
import { createClient } from "@/server/supabase/server";
import { cookies } from "next/headers";
import { logAudit } from "@/server/audit";
import { ALLOWED_EMAIL_DOMAIN, type UserRole, ROLE_DASHBOARD_ROUTES } from "@/lib/constants";

// Shared name validation: letters (any script), spaces, hyphen, apostrophe and
// period. A suffix may additionally contain a comma ("Jr., III"). Reused by
// both register() and updateProfile() so the stored profile always obeys the
// same rules.
const NAME_RE = /^[\p{L} .'-]+$/u;
const SUFFIX_RE = /^[\p{L} .,'-]+$/u;

export type RegisterResult =
  | { success: true }
  | { success: false; error: string };

export type RegisterInput = {
  firstName: string;
  lastName: string;
  middleInitial?: string;
  suffix?: string;
  srCode: string;
  email: string;
  password: string;
  role?: UserRole;
};

export type LoginResult =
  | { success: true; userId: string; role: UserRole }
  | { success: false; error: string };

export type LoginInput = {
  email: string;
  password: string;
};

export async function login(input: LoginInput): Promise<LoginResult> {
  const email = input.email.toLowerCase().trim();
  const password = input.password;

  if (!email) {
    return { success: false, error: "Email is required." };
  }
  if (!password) {
    return { success: false, error: "Password is required." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      return {
        success: false,
        error: "Invalid email or password. Please try again.",
      };
    }
    if (error.message.includes("Email not confirmed")) {
      return {
        success: false,
        error: "Please verify your email before signing in.",
      };
    }
    return { success: false, error: error.message };
  }

  // Fetch user role from profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .single();

  if (profileError) {
    console.error("Error fetching user role:", profileError);
  }

  // Block disabled accounts from signing in
  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    return {
      success: false,
      error:
        "Your account has been disabled. Please contact the department administrator.",
    };
  }

  const role = (profile?.role as UserRole) || "student";

  console.log(`User ${data.user.id} logged in with role: ${role}`);

  // Audit trail. The actor is passed EXPLICITLY: signInWithPassword just wrote
  // the session cookies onto the RESPONSE, so a lookup here would miss them.
  const meta = (data.user.user_metadata ?? {}) as {
    first_name?: string;
    last_name?: string;
  };
  await logAudit({
    action: "login",
    actor: {
      id: data.user.id,
      email: data.user.email ?? email,
      name: [meta.first_name, meta.last_name].filter(Boolean).join(" ") || null,
      role,
    },
    description: `Signed in as ${role}.`,
    metadata: { method: "password" },
  });

  return { success: true, userId: data.user.id, role };
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const middleInitial = input.middleInitial?.trim();
  const suffix = input.suffix?.trim();
  const srCode = input.srCode.trim();
  const email = input.email.toLowerCase().trim();
  const password = input.password;
  const role = input.role || "student";

  // ── Server-side validation ──────────────────────────────────
  // Names accept letters (any script), spaces, hyphen, apostrophe and period;
  // a suffix may also contain a comma. Digits/symbols are rejected so a crafted
  // request can't store a name that breaks the UI or later export.
  if (!firstName || firstName.length < 2) {
    return { success: false, error: "First name must be at least 2 characters." };
  }
  if (!NAME_RE.test(firstName)) {
    return {
      success: false,
      error:
        "First name may only contain letters, spaces, hyphens, apostrophes and periods.",
    };
  }
  if (!lastName || lastName.length < 2) {
    return { success: false, error: "Last name must be at least 2 characters." };
  }
  if (!NAME_RE.test(lastName)) {
    return {
      success: false,
      error:
        "Last name may only contain letters, spaces, hyphens, apostrophes and periods.",
    };
  }
  if (suffix && !SUFFIX_RE.test(suffix)) {
    return {
      success: false,
      error: "Suffix may only contain letters, spaces, periods, commas and hyphens.",
    };
  }
  if (middleInitial && middleInitial.length > 1 && !/^[A-Za-z]\.?$/.test(middleInitial)) {
    return {
      success: false,
      error: "Middle initial must be a letter and optional period (e.g. M or M.).",
    };
  }
  if (!srCode) {
    return { success: false, error: "SR code is required." };
  }
  if (!email) {
    return { success: false, error: "Email is required." };
  }
  if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    return {
      success: false,
      error: `Only ${ALLOWED_EMAIL_DOMAIN} email addresses are allowed for registration.`,
    };
  }
  // The email's local part must BE the SR code (e.g. 23-93627@g.batstate-u.edu.ph).
  if (email.split("@")[0].toLowerCase() !== srCode.toLowerCase()) {
    return {
      success: false,
      error: `Your SR code must match your email address (e.g. ${srCode}${ALLOWED_EMAIL_DOMAIN}).`,
    };
  }
  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  // ── Create account via Supabase ─────────────────────────────
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        middle_initial: middleInitial || null,
        suffix: suffix || null,
        sr_code: srCode,
        role: role,
      },
    },
  });

  if (error) {
    if (
      error.message.includes("already registered") ||
      error.message.includes("already exists") ||
      error.message.toLowerCase().includes("already been registered") ||
      (error.message.includes("email address") &&
        error.message.toLowerCase().includes("already"))
    ) {
      return {
        success: false,
        error: "This email address is already in use. Please sign in instead.",
      };
    }
    return { success: false, error: error.message };
  }

  // Some Supabase flows return a session-less (200) with an empty identity list
  // when the email is already taken (confirmation-dependent) rather than an
  // error. Guard so the user never hits a confusing "account created" message.
  if (data?.user?.identities?.length === 0) {
    return {
      success: false,
      error: "This email address is already in use. Please sign in instead.",
    };
  }

  // The profile row is created automatically by the on_auth_user_created
  // trigger (migration 039), which is SECURITY DEFINER and copies
  // names/role/sr_code from the user_metadata above. It bypasses RLS so it
  // works for BOTH email signup and Google OAuth identically. Do NOT add a
  // client-side profiles insert here — it fails RLS when no session exists
  // (email confirmation on) and would recreate the very error we fixed.

  // Clear any session set by signUp to prevent auto-login
  await supabase.auth.signOut();

  // Audit trail: a self-registration (no session exists — the actor is built
  // from the signup payload).
  await logAudit({
    action: "account_registered",
    actor: {
      id: data?.user?.id ?? null,
      email,
      name: [firstName, lastName].filter(Boolean).join(" ") || null,
      role,
    },
    entityType: "user",
    entityId: data?.user?.id ?? null,
    entityLabel: `${firstName} ${lastName}`.trim(),
    description: `Registered a new ${role} account (${email}).`,
    metadata: { srCode, role },
  });

  return { success: true };
}

// ── Current user (server-side fetch) ────────────────────────────

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleInitial: string | null;
  suffix: string | null;
  srCode: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  signatureUrl: string | null;
};

// ── Request-scoped session memo ─────────────────────────────────
//
// getCurrentUser() is called from 120-odd places and costs TWO Supabase round
// trips (auth.getUser + the profiles select). A single page render routinely
// calls it 2–4 times — page, role shell, and a child action — so the same two
// queries were being paid for repeatedly on every navigation.
//
// React's cache() memoises for the lifetime of ONE request: it is dead before
// the next request, so nothing here can ever be stale and there is no
// invalidation to get wrong. The exported action keeps its async signature
// because a "use server" module may only export async functions — hence the
// private const plus the thin wrapper below.
const loadCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (!user) {
    // Diagnosability for the "randomly logged out mid-task" reports: this is
    // the single choke point where a page loses its session, and it used to
    // fail silently. Log WHY (refresh token rejected vs. no cookie at all) —
    // cookie NAMES only, never values, so nothing sensitive is written.
    try {
      const jar = await cookies();
      const names = jar.getAll().map((c) => c.name);
      const hasAuthCookie = names.some((n) => n.includes("-auth-token"));
      console.warn(
        "[auth] getCurrentUser: no user ->",
        authError?.message ?? "no error reported",
        "| status:", (authError as { status?: number } | null)?.status ?? "n/a",
        "| auth cookie present:", hasAuthCookie,
        "| SB cookies:", names.filter((n) => n.startsWith("sb-")).join(",") || "none",
      );
    } catch {
      // cookies() is unavailable outside a request scope — logging is optional.
    }
    return null;
  }

  // Fetch profile from public.profiles, fall back to auth user_metadata
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const metadata = user.user_metadata || {};

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? "",
    firstName: profile?.first_name || metadata.first_name || "",
    lastName: profile?.last_name || metadata.last_name || "",
    middleInitial: profile?.middle_initial || metadata.middle_initial || null,
    suffix: profile?.suffix || metadata.suffix || null,
    srCode: profile?.sr_code || metadata.sr_code || "",
    role: (profile?.role as UserRole) || metadata.role || "student",
    isActive: profile?.is_active !== false,
    avatarUrl: profile?.avatar_url || null,
    signatureUrl: profile?.signature_url || null,
  };
});

/**
 * The signed-in account, memoised for this request.
 *
 * NOTE for actions that CHANGE the current account (rename, signature upload):
 * a later getCurrentUser() in the SAME request returns the pre-change snapshot.
 * Re-read through createClient() there, or let the client's refresh start a new
 * request — the memo never outlives the request.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return loadCurrentUser();
}

// ── Get dashboard route for role ───────────────────────────────

export async function getDashboardRouteForRole(role: UserRole): Promise<string> {
  return ROLE_DASHBOARD_ROUTES[role] || "/dashboard";
}

// ── Logout ──────────────────────────────────────────────────────

export type LogoutResult = { success: true } | { success: false; error: string };

export async function logout(): Promise<LogoutResult> {
  const supabase = await createClient();

  // Log it BEFORE signing out — afterwards there is no session left to
  // attribute the event to.
  await logAudit({ action: "logout", description: "Signed out." });

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout error:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ── Update profile avatar URL ────────────────────────────────────

export type UpdateAvatarResult = { success: true } | { success: false; error: string };

// ── Update editable profile fields ───────────────────────────────
// Students/staff can edit their own First Name, Last Name, Middle
// Initial, and Suffix. SR Code and (GSuite) email are NOT editable
// here — they are set at account creation and managed by the
// department office.

export type UpdateProfileResult = { success: true } | { success: false; error: string };

export async function updateProfile(input: {
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  suffix?: string;
  /** Only applied when the profile's SR code is currently empty (e.g. Google sign-in). */
  srCode?: string;
}): Promise<UpdateProfileResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const updates: Record<string, unknown> = {};

  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const middleInitial = input.middleInitial?.trim();
  const suffix = input.suffix?.trim();
  const srCode = input.srCode?.trim();

  if (firstName !== undefined) {
    if (firstName.length < 2) {
      return { success: false, error: "First name must be at least 2 characters." };
    }
    if (!NAME_RE.test(firstName)) {
      return { success: false, error: "First name may only contain letters, spaces, hyphens, apostrophes and periods." };
    }
    updates.first_name = firstName;
  }
  if (lastName !== undefined) {
    if (lastName.length < 2) {
      return { success: false, error: "Last name must be at least 2 characters." };
    }
    if (!NAME_RE.test(lastName)) {
      return { success: false, error: "Last name may only contain letters, spaces, hyphens, apostrophes and periods." };
    }
    updates.last_name = lastName;
  }
  if (middleInitial !== undefined) {
    if (middleInitial.length > 1 && !/^[A-Za-z]\.?$/.test(middleInitial)) {
      return {
        success: false,
        error: "Middle initial must be a letter and optional period (e.g. M or M.).",
      };
    }
    updates.middle_initial = middleInitial || null;
  }
  if (suffix !== undefined) {
    if (suffix.length > 0 && !SUFFIX_RE.test(suffix)) {
      return {
        success: false,
        error: "Suffix may only contain letters, spaces, periods, commas, hyphens and apostrophes.",
      };
    }
    updates.suffix = suffix || null;
  }
  if (srCode !== undefined) {
    // Basic format: digits with optional dash, e.g. 00-00000. The server RPC
    // only applies it when the profile's current value is empty.
    updates.sr_code = srCode;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "Nothing to update." };
  }

  const supabase = await createClient();

  // Use a SECURITY DEFINER RPC so the row is always addressed by the real
  // auth.uid() and the write is guaranteed (bypasses any RLS UPDATE quirk).
  const { data, error } = await supabase.rpc("update_own_profile_fields", {
    p_first_name: updates.first_name ?? null,
    p_last_name: updates.last_name ?? null,
    p_middle_initial: updates.middle_initial ?? null,
    p_suffix: updates.suffix ?? null,
    p_sr_code: updates.sr_code ?? null,
  });

  if (error) {
    console.error("[auth] Failed to update profile (RPC):", error);
    return { success: false, error: "Failed to update profile. Please try again." };
  }
  if (data === false) {
    return { success: false, error: "Profile not found for this account. Please contact support." };
  }
  return { success: true };
}

export async function updateProfileAvatar(avatarUrl: string): Promise<UpdateAvatarResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const supabase = await createClient();
  // SECURITY DEFINER RPC keyed on auth.uid() — guaranteed write.
  const { data, error } = await supabase.rpc("update_own_avatar_url", {
    p_avatar_url: avatarUrl,
  });

  if (error) {
    console.error("[auth] Failed to update avatar (RPC):", error);
    return { success: false, error: "Failed to update profile picture." };
  }
  if (data === false) {
    return { success: false, error: "Could not update profile picture for this account." };
  }
  return { success: true };
}

// ── Update digital signature URL ───────────────────────────
// Affair roles (adviser, associate_dean, dean, vcrdes) upload a digital
// signature image that will be stamped onto approved TAFs. The client
// uploads the file to the `signatures` bucket, then persists the public URL
// here via a SECURITY DEFINER RPC keyed on auth.uid().

export async function updateSignature(signatureUrl: string): Promise<UpdateAvatarResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_own_signature_url", {
    p_signature_url: signatureUrl,
  });

  if (error) {
    console.error("[auth] Failed to update signature (RPC):", error);
    return { success: false, error: "Failed to update digital signature." };
  }
  if (data === false) {
    return { success: false, error: "Could not update digital signature for this account." };
  }
  return { success: true };
}

// ── Change password ──────────────────────────────────────────────
// Verifies the current password by re-signing in, then sets the new
// password so only the account owner with the correct current password
// can change it.

export type ChangePasswordResult = { success: true } | { success: false; error: string };

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ChangePasswordResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const currentPassword = input.currentPassword;
  const newPassword = input.newPassword;

  if (!currentPassword) {
    return { success: false, error: "Current password is required." };
  }
  if (newPassword.length < 8) {
    return { success: false, error: "New password must be at least 8 characters." };
  }
  if (currentPassword === newPassword) {
    return { success: false, error: "New password must be different from the current password." };
  }

  const supabase = await createClient();

  // Which identity does this account actually sign in with? A Google-created
  // account has NO password provider, so "change password" can never work there
  // — it used to fail with a bare generic message that looked like a bug.
  const { data: authNow } = await supabase.auth.getUser();
  const providers = (authNow.user?.app_metadata?.providers as string[] | undefined) ?? [];
  const signInEmail = user.email || authNow.user?.email || "";

  if (!providers.includes("email")) {
    return {
      success: false,
      error:
        "This account signs in with Google, so it has no password to change here. Manage it from your Google account, or ask the department to set a password.",
    };
  }
  if (!signInEmail) {
    return {
      success: false,
      error:
        "This account has no email on file, so the current password cannot be verified. Ask the department to correct your account email.",
    };
  }

  // 1. Verify the current password (re-authenticate with the auth email).
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: signInEmail,
    password: currentPassword,
  });
  if (signInErr) {
    if (signInErr.message.toLowerCase().includes("invalid login credentials")) {
      return { success: false, error: "Current password is incorrect." };
    }
    return { success: false, error: signInErr.message };
  }

  // 2. Set the new password.
  //
  // `current_password` is REQUIRED when the Supabase project has "Secure
  // password change" enabled — without it GoTrue answers
  // "Current password required" and the change fails even though the caller just
  // re-authenticated. It is ignored by projects that do not enable the setting,
  // so sending it is always correct. (`as unknown as` because the client's TS
  // types do not include the field yet.)
  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  } as unknown as { password: string });

  if (updateErr) {
    console.error("[auth] Failed to change password:", updateErr);
    // Surface what Supabase actually said (weak password, same-as-old, rate
    // limit...). A generic "please try again" hid the reason and made a real,
    // fixable rejection look like a bug in this app.
    const detail = updateErr.message?.trim();
    return {
      success: false,
      error: detail
        ? `Failed to change password: ${detail}`
        : "Failed to change password. Please try again.",
    };
  }

  await logAudit({
    action: "password_reset",
    category: "auth",
    entityType: "user",
    entityId: user.id,
    entityLabel: `${user.firstName} ${user.lastName}`.trim(),
    description: "Changed their own account password.",
    actor: { id: user.id, email: user.email, role: user.role },
  });

  return { success: true };
}

// ── Set a new password (password-reset flow) ───────────────────────
// Called from the /auth/update-password page after the user clicked the
// recovery link and Supabase exchanged its code for a session. Unlike
// changePassword there is no current-password check — Supabase treats the
// recovery session as proof of ownership.
export async function updatePassword(
  password: string
): Promise<{ success: true } | { success: false; error: string }> {
  if (!password || password.length < 8) {
    return {
      success: false,
      error: "Password must be at least 8 characters.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("[auth] Failed to update password:", error);
    return {
      success: false,
      error: "Failed to update your password. The link may have expired — please request a new one.",
    };
  }

  return { success: true };
}
