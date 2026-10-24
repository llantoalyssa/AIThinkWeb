"use server";
import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";
export type MonthPoint = {

  month: number;

  label: string;

  count: number;
};

export type AcademicYearSummary = {

  label: string;

  startYear: number;

  total: number;

  months: MonthPoint[];

  peak: MonthPoint | null;

  trough: MonthPoint | null;
};

export type ExecutiveSummaryData = {
  totalSubmissions: number;

  pendingSubmissions: number;

  academicYears: AcademicYearSummary[];
};

export type ExecutiveSummaryResult =
  | { success: true; data: ExecutiveSummaryData }
  | { success: false; error: string };
const MONTH_LABELS = [
  "Aug", "Sep", "Oct", "Nov", "Dec", "Jan",
  "Feb", "Mar", "Apr", "May", "Jun", "Jul",
];
function academicStartYear(date: Date): number {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  return m >= 8 ? y : y - 1;
}
function monthIndexInAcademicYear(calendarMonth: number): number {

  return calendarMonth >= 8
    ? calendarMonth - 8
    : calendarMonth + 4;
}

function buildSummary(startYear: number, samples: Date[]): AcademicYearSummary {
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => {
    const calendarMonth = i < 4 ? i + 8 : i - 4;
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
export async function getExecutiveSummary(): Promise<ExecutiveSummaryResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (!["dean", "vcrdes"].includes(user.role)) {
    return { success: false, error: "Only approvers can view the executive summary." };
  }

  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("group_taf_submissions")
    .select("submitted_at, status");

  if (error) {
    console.error("[exec-summ] Failed to load submissions:", error);
    return { success: false, error: "Failed to load submission data." };
  }
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
  const pendingSubmissions = ((rows || []) as any[]).filter(
    (r) => r?.status === "pending" || r?.status === "under_review",
  ).length;

  return {
    success: true,
    data: { totalSubmissions, pendingSubmissions, academicYears },
  };
}