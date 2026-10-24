"use server";

import { createClient } from "@/server/supabase/server";
import { cookies } from "next/headers";
import { logAudit } from "@/server/audit";
import { ALLOWED_EMAIL_DOMAIN, type UserRole, ROLE_DASHBOARD_ROUTES } from "@/lib/constants";
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
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .single();

  if (profileError) {
    console.error("Error fetching user role:", profileError);
  }
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

  if (email.split("@")[0].toLowerCase() !== srCode.toLowerCase()) {
    return {
      success: false,
      error: `Your SR code must match your email address (e.g. ${srCode}${ALLOWED_EMAIL_DOMAIN}).`,
    };
  }
  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }
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
  if (data?.user?.identities?.length === 0) {
    return {
      success: false,
      error: "This email address is already in use. Please sign in instead.",
    };
  }
  await supabase.auth.signOut();
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

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (!user) {
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

    }
    return null;
  }
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
}
export async function getDashboardRouteForRole(role: UserRole): Promise<string> {
  return ROLE_DASHBOARD_ROUTES[role] || "/dashboard";
}
export type LogoutResult = { success: true } | { success: false; error: string };

export async function logout(): Promise<LogoutResult> {
  const supabase = await createClient();
  await logAudit({ action: "logout", description: "Signed out." });

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout error:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}
export type UpdateAvatarResult = { success: true } | { success: false; error: string };
export type UpdateProfileResult = { success: true } | { success: false; error: string };

export async function updateProfile(input: {
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  suffix?: string;

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
    updates.sr_code = srCode;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "Nothing to update." };
  }

  const supabase = await createClient();
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
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInErr) {
    if (signInErr.message.toLowerCase().includes("invalid login credentials")) {
      return { success: false, error: "Current password is incorrect." };
    }
    return { success: false, error: signInErr.message };
  }
  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateErr) {
    console.error("[auth] Failed to change password:", updateErr);
    return { success: false, error: "Failed to change password. Please try again." };
  }

  return { success: true };
}
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