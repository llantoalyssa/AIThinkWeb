// ============================================================
// Admin Analytics — shared types + helpers.
//
// A PLAIN module (no "use server"): a server-action file may only export async
// functions, so the range labels and the parser live here and both the page and
// the action import them.
// ============================================================

export type AdminAnalyticsRange = "today" | "month" | "year" | "all" | "custom";

export const RANGE_LABELS: Record<AdminAnalyticsRange, string> = {
  today: "Today",
  month: "This month",
  year: "This year",
  all: "All time",
  custom: "Custom dates",
};

export const RANGE_ORDER: AdminAnalyticsRange[] = ["today", "month", "year", "all"];

export function parseRange(
  raw: string | string[] | undefined,
): AdminAnalyticsRange {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "today" ||
    value === "month" ||
    value === "year" ||
    value === "all" ||
    value === "custom"
    ? value
    : // All time is the default view: a fresh visit should show the college's
      // whole record, not a window that reads as "nothing happened today".
      "all";
}

/** An inclusive calendar-day span, as `YYYY-MM-DD` in Philippine time. */
export type CustomDateRange = { from: string; to: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

/**
 * Validate `?from=`/`?to=`. Returns null unless BOTH are real dates with
 * from <= to — a half-filled or reversed span must fall back to the preset
 * range instead of silently reporting zero for everything.
 */
export function parseCustomRange(
  fromRaw: string | string[] | undefined,
  toRaw: string | string[] | undefined,
): CustomDateRange | null {
  const from = (Array.isArray(fromRaw) ? fromRaw[0] : fromRaw)?.trim() ?? "";
  const to = (Array.isArray(toRaw) ? toRaw[0] : toRaw)?.trim() ?? "";
  if (!isRealDate(from) || !isRealDate(to)) return null;
  if (from > to) return null; // ISO dates compare lexicographically
  return { from, to };
}

/** "2026-10-01" → "Oct 1, 2026" (no timezone conversion: it is a plain day). */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-PH", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Human label for the active range, including a custom span. */
export function rangeLabel(
  range: AdminAnalyticsRange,
  custom?: CustomDateRange | null,
): string {
  if (range === "custom" && custom) {
    return `${formatDay(custom.from)} – ${formatDay(custom.to)}`;
  }
  return RANGE_LABELS[range];
}

export type AdminAnalyticsData = {
  generatedAt: string;
  range: AdminAnalyticsRange;
  /** ISO timestamp the range starts at (null = all time). */
  rangeStart: string | null;
  /** ISO timestamp the range ENDS at, exclusive (null = open-ended). */
  rangeEnd: string | null;
  users: {
    total: number;
    students: number;
    staff: number;
    /** Accounts created inside the selected range. */
    createdInRange: number;
    byRole: { role: string; label: string; count: number }[];
  };
  activity: {
    activeLast24h: number;
    activeLast7d: number;
    neverSignedIn: number;
    recent: {
      id: string;
      name: string;
      email: string;
      role: string;
      roleLabel: string;
      lastSignInAt: string | null;
    }[];
  };
  tafs: {
    submitted: number;
    pending: number;
    approved: number;
    returned: number;
    /** Average days from submission to full approval, for approvals in range. */
    avgDaysToApproval: number | null;
  };
};

export type AdminAnalyticsResult =
  | { success: true; data: AdminAnalyticsData }
  | { success: false; error: string };
