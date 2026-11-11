"use server";
import { createAdminClient } from "@/server/supabase/admin";
import { getCurrentUser } from "@/server/actions/auth";
import { USER_ROLES, type UserRole } from "@/lib/constants";
import type {
  AdminAnalyticsRange,
  CustomDateRange,
  AdminAnalyticsData,
  AdminAnalyticsResult,
} from "@/lib/admin-analytics";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function manilaParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function rangeStart(
  range: AdminAnalyticsRange,
  custom?: CustomDateRange | null,
): Date | null {
  const now = new Date();
  const { year, month, day } = manilaParts(now);
  switch (range) {
    case "today":
      return new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS);
    case "month":
      return new Date(Date.UTC(year, month - 1, 1) - MANILA_OFFSET_MS);
    case "year":
      return new Date(Date.UTC(year, 0, 1) - MANILA_OFFSET_MS);
    case "custom": {
      if (!custom) return null;
      const [y, m, d] = custom.from.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d) - MANILA_OFFSET_MS);
    }
    default:
      return null;
  }
}
function rangeEnd(
  range: AdminAnalyticsRange,
  custom?: CustomDateRange | null,
): Date | null {
  if (range !== "custom" || !custom) return null;
  const [y, m, d] = custom.to.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) - MANILA_OFFSET_MS);
}

function displayName(row: {
  first_name?: string | null;
  middle_initial?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const parts = [row.first_name, row.middle_initial, row.last_name]
    .filter((part): part is string => !!part && String(part).trim().length > 0)
    .map((part) => String(part).trim());
  if (parts.length === 0) return row.email || "Unknown";
  return parts.join(" ");
}

export async function getAdminAnalytics(
  range: AdminAnalyticsRange,
  custom?: CustomDateRange | null,
): Promise<AdminAnalyticsResult> {
  const actor = await getCurrentUser();
  if (!actor) return { success: false, error: "You must be logged in." };
  if (actor.role !== "department") {
    return { success: false, error: "Only department accounts can view Admin Analytics." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      success: false,
      error:
        "Admin Analytics needs SUPABASE_SERVICE_ROLE_KEY (it reads auth.users.last_sign_in_at for active users).",
    };
  }

  const start = rangeStart(range, custom);
  const startIso = start ? start.toISOString() : null;
  const end = rangeEnd(range, custom);
  const endIso = end ? end.toISOString() : null;
  const authUsers: {
    id: string;
    email: string | null;
    created_at: string;
    last_sign_in_at: string | null;
  }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("[admin-analytics] listUsers failed:", error);
      break;
    }
    const batch = data?.users ?? [];
    for (const u of batch) {
      authUsers.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }
    if (batch.length < 1000) break;
  }

  const [profilesRes, subsRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role, first_name, middle_initial, last_name, email, is_active"),
    admin
      .from("group_taf_submissions")
      .select("status, submitted_at, fully_approved_at, returned_at"),
  ]);

  if (profilesRes.error) {
    console.error("[admin-analytics] profiles read failed:", profilesRes.error);
  }
  if (subsRes.error) {
    console.error("[admin-analytics] submissions read failed:", subsRes.error);
  }

  const profiles = (profilesRes.data ?? []) as {
    id: string;
    role: string | null;
    first_name: string | null;
    middle_initial: string | null;
    last_name: string | null;
    email: string | null;
    is_active: boolean | null;
  }[];

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const roleCounts = new Map<string, number>();
  let students = 0;
  let staff = 0;
  for (const p of profiles) {
    const role = p.role ?? "student";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    if (role === "student") students++;
    else staff++;
  }

  const byRole = (Object.keys(USER_ROLES) as UserRole[])
    .map((role) => ({
      role,
      label: USER_ROLES[role],
      count: roleCounts.get(role) ?? 0,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  let activeLast24h = 0;
  let activeLast7d = 0;
  let neverSignedIn = 0;
  let createdInRange = 0;

  for (const u of authUsers) {
    if (!u.last_sign_in_at) neverSignedIn++;
    else {
      const t = new Date(u.last_sign_in_at).getTime();
      if (t >= dayAgo) activeLast24h++;
      if (t >= weekAgo) activeLast7d++;
    }
    const createdMs = new Date(u.created_at).getTime();
    const afterStart = !startIso || createdMs >= new Date(startIso).getTime();
    const beforeEnd = !endIso || createdMs < new Date(endIso).getTime();
    if (afterStart && beforeEnd) createdInRange++;
  }

  const recent = authUsers
    .filter((u) => !!u.last_sign_in_at)
    .sort(
      (a, b) =>
        new Date(b.last_sign_in_at as string).getTime() -
        new Date(a.last_sign_in_at as string).getTime(),
    )
    .slice(0, 8)
    .map((u) => {
      const p = profileById.get(u.id);
      const role = p?.role ?? "student";
      return {
        id: u.id,
        name: p ? displayName(p) : u.email ?? "Unknown",
        email: p?.email || u.email || "—",
        role,
        roleLabel: USER_ROLES[role as UserRole] ?? role,
        lastSignInAt: u.last_sign_in_at,
      };
    });
  const submissions = (subsRes.data ?? []) as {
    status: string | null;
    submitted_at: string | null;
    fully_approved_at: string | null;
    returned_at: string | null;
  }[];

  const inRange = (iso: string | null): boolean => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (startIso && t < new Date(startIso).getTime()) return false;
    if (endIso && t >= new Date(endIso).getTime()) return false;
    return true;
  };

  let submitted = 0;
  let pending = 0;
  let approved = 0;
  let returned = 0;
  let approvalMsTotal = 0;
  let approvalSamples = 0;

  for (const s of submissions) {
    if (inRange(s.submitted_at)) {
      submitted++;
      if (s.status === "pending" || s.status === "under_review") pending++;
    }
    if (inRange(s.fully_approved_at)) {
      approved++;
      if (s.submitted_at && s.fully_approved_at) {
        const ms =
          new Date(s.fully_approved_at).getTime() -
          new Date(s.submitted_at).getTime();
        if (ms >= 0) {
          approvalMsTotal += ms;
          approvalSamples++;
        }
      }
    }
    if (inRange(s.returned_at)) returned++;
  }

  const data: AdminAnalyticsData = {
    generatedAt: new Date().toISOString(),
    range,
    rangeStart: startIso,
    rangeEnd: endIso,
    users: {
      total: profiles.length,
      students,
      staff,
      createdInRange,
      byRole,
    },
    activity: {
      activeLast24h,
      activeLast7d,
      neverSignedIn,
      recent,
    },
    tafs: {
      submitted,
      pending,
      approved,
      returned,
      avgDaysToApproval:
        approvalSamples > 0
          ? Math.round((approvalMsTotal / approvalSamples / 86_400_000) * 10) / 10
          : null,
    },
  };

  return { success: true, data };
}