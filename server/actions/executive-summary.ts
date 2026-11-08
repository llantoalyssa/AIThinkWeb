"use server";


import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";
import { getMyGrantedPermissions } from "@/server/actions/permissions";

// ── Types ──────────────────────────────────────────────────

export type MonthPoint = {
  /** 1-12 (calendar month). */
  month: number;
  /** Short label e.g. "Aug". */
  label: string;
  /** Submissions in that month. */
  count: number;
};

export type AcademicYearSummary = {
  /** e.g. "2025 - 2026". */
  label: string;
  /** Start year of the academic year (Aug). */
  startYear: number;
  /** Total submissions across the whole academic year. */
  total: number;
  /** 12 points Aug→Jul. */
  months: MonthPoint[];
  /** Month with the highest count (or null if none). */
  peak: MonthPoint | null;
  /** Month with the lowest count (tie → earlier month). */
  trough: MonthPoint | null;
};

export type ExecutiveSummaryData = {
  totalSubmissions: number;
  /** Submissions still awaiting an approver decision (pending / under_review). */
  pendingSubmissions: number;
  /** All academic years present, oldest first. */
  academicYears: AcademicYearSummary[];
};

export type ExecutiveSummaryResult =
  | { success: true; data: ExecutiveSummaryData }
  | { success: false; error: string };

// ── Helpers ─────────────────────────────────────────────────

const MONTH_LABELS = [
  "Aug", "Sep", "Oct", "Nov", "Dec", "Jan",
  "Feb", "Mar", "Apr", "May", "Jun", "Jul",
];

function academicStartYear(date: Date): number {
  const m = date.getMonth() + 1; // 1-12
  const y = date.getFullYear();
  return m >= 8 ? y : y - 1;
}

// Map a calendar month (1-12) to its index 0-11 in an Aug-started year.
function monthIndexInAcademicYear(calendarMonth: number): number {
  // Aug=8 → 0 ... Dec=12 → 4, Jan=1 → 5 ... Jul=7 → 11
  return calendarMonth >= 8
    ? calendarMonth - 8
    : calendarMonth + 4;
}

function buildSummary(startYear: number, samples: Date[]): AcademicYearSummary {
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => {
    const calendarMonth = i < 4 ? i + 8 : i - 4; // index→calendar month
    return { month: calendarMonth, label: MONTH_LABELS[i], count: 0 };
  });

  for (const d of samples) {
    const idx = monthIndexInAcademicYear(d.getMonth() + 1);
    months[idx].count += 1;
  }

  const total = months.reduce((a, m) => a + m.count, 0);

  let peak: MonthPoint | null = null;
  for (const m of months) {
    if (!peak || m.count > peak.count) peak = m;
  }
  const nonZero = months.filter((m) => m.count > 0);
  let trough: MonthPoint | null = nonZero.length ? nonZero[0] : null;
  for (const m of nonZero) {
    if (m.count < trough!.count) trough = m;
  }
  if (total === 0) trough = null;

  return {
    label: `${startYear} - ${startYear + 1}`,
    startYear,
    total,
    months,
    peak,
    trough,
  };
}

// ── Main fetch ──────────────────────────────────────────────

export async function getExecutiveSummary(): Promise<ExecutiveSummaryResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const granted = await getMyGrantedPermissions();
  if (!granted.includes("executive_summary.view")) {
    return {
      success: false,
      error: "This account has not been granted the Executive Summary.",
    };
  }

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("group_taf_submissions")
    .select("submitted_at, status");

  if (error) {
    console.error("[exec-summ] Failed to load submissions:", error);
    return { success: false, error: "Failed to load submission data." };
  }

  // Group submitted_at timestamps by academic start year.
  const byYear = new Map<number, Date[]>();
  for (const r of (rows || []) as any[]) {
    if (!r?.submitted_at) continue;
    const d = new Date(r.submitted_at);
    if (isNaN(d.getTime())) continue;
    const sy = academicStartYear(d);
    if (!byYear.has(sy)) byYear.set(sy, []);
    byYear.get(sy)!.push(d);
  }

  const academicYears: AcademicYearSummary[] = Array.from(byYear.keys())
    .sort((a, b) => a - b)
    .map((sy) => buildSummary(sy, byYear.get(sy)!));

  const totalSubmissions = academicYears.reduce((a, y) => a + y.total, 0);

  // Still awaiting an approver decision — not yet fully approved.
  const pendingSubmissions = ((rows || []) as any[]).filter(
    (r) => r?.status === "pending" || r?.status === "under_review",
  ).length;

  return {
    success: true,
    data: { totalSubmissions, pendingSubmissions, academicYears },
  };
}