"use server";
import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "./auth";

export type DashboardTaf = {
  tafId: string;
  title: string;
  status: string;
  createdAt: string;
  similarity: number;
};

export type StudentDashboardData = {
  monthlyCounts: { month: string; count: number }[];

  lowest: DashboardTaf | null;

  highest: DashboardTaf | null;

  pinned: DashboardTaf[];

  recent: DashboardTaf[];
};

export type StudentDashboardResult =
  | { success: true; data: StudentDashboardData }
  | { success: false; error: string };

export async function getStudentDashboardData(): Promise<StudentDashboardResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };
  if (user.role !== "student") {
    return { success: false, error: "Only students can view this dashboard." };
  }

  const supabase = await createClient();
  const { data: tafs, error: tafErr } = await supabase
    .from("topic_abstract_forms")
    .select("id, proposed_title, status, created_at, updated_at, submitted_at")
    .eq("student_id", user.id)
    .order("updated_at", { ascending: false });

  if (tafErr) {
    console.error("[student-dashboard] Failed to load TAFs:", tafErr);
    return { success: false, error: "Failed to load your TAFs." };
  }

  const tafRows = (tafs || []) as {
    id: string;
    proposed_title: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    submitted_at: string | null;
  }[];

  const tafIds = tafRows.map((t) => t.id);
  let analysisRows: { taf_id: string; combined_score: number | null }[] = [];
  if (tafIds.length > 0) {
    const { data, error } = await supabase
      .from("taf_analysis_results")
      .select("taf_id, combined_score, version_number, analyzed_at")
      .in("taf_id", tafIds)
      .order("analyzed_at", { ascending: false });
    if (!error && data) {
      analysisRows = data as {
        taf_id: string;
        combined_score: number | null;
        version_number: number;
        analyzed_at: string;
      }[];
    }
  }
  const scoreByTaf = new Map<
    string,
    { lowest: number; latest: number }
  >();
  for (const r of analysisRows) {
    const s = Number(r.combined_score) || 0;
    const cur = scoreByTaf.get(r.taf_id);
    if (!cur) {
      scoreByTaf.set(r.taf_id, { lowest: s, latest: s });
    } else {
      cur.lowest = Math.min(cur.lowest, s);
    }
  }

  const build = (t: (typeof tafRows)[number], sim: number): DashboardTaf => ({
    tafId: t.id,
    title: t.proposed_title || "Untitled",
    status: t.status,
    createdAt: t.created_at || "",
    similarity: sim,
  });
  let lowest: DashboardTaf | null = null;
  let highest: DashboardTaf | null = null;
  for (const t of tafRows) {
    const sc = scoreByTaf.get(t.id)?.lowest;
    if (sc === undefined) continue;
    const d = build(t, sc);
    if (!lowest || sc < lowest.similarity) lowest = d;
    if (!highest || sc > highest.similarity) highest = d;
  }
  const { data: submissions, error: subErr } = await supabase
    .from("group_taf_submissions")
    .select("taf_id, submitted_at")
    .eq("submitted_by", user.id);
  if (subErr) {
    console.error("[student-dashboard] Failed to load submitted TAFs:", subErr);
  }
  const submittedAt = new Map<string, string>();
  for (const s of submissions || []) {
    const row = s as { taf_id: string; submitted_at: string };
    if (row.taf_id) submittedAt.set(row.taf_id, row.submitted_at || "");
  }

  const monthly = new Map<string, number>();
  for (const t of tafRows) {
    const subDate = submittedAt.get(t.id);
    if (!subDate) continue;
    const key = subDate.slice(0, 7);
    if (key && key.includes("-")) {
      monthly.set(key, (monthly.get(key) || 0) + 1);
    }
  }
  const monthlyCounts: { month: string; count: number }[] = [];
  if (monthly.size > 0) {
    const keys = Array.from(monthly.keys()).sort();
    const [startY, startM] = keys[0].split("-").map(Number);
    const [endY, endM] = keys[keys.length - 1].split("-").map(Number);
    if (
      Number.isFinite(startY) &&
      Number.isFinite(startM) &&
      Number.isFinite(endY) &&
      Number.isFinite(endM)
    ) {
      let y = startY;
      let m = startM;
      while (y < endY || (y === endY && m <= endM)) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        monthlyCounts.push({ month: key, count: monthly.get(key) || 0 });
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    } else {

      monthlyCounts.push(
        ...Array.from(monthly.entries())
          .map(([month, count]) => ({ month, count }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      );
    }
  }
  let recents: {
    taf_id: string;
    proposed_title: string | null;
    pinned: boolean;
    visited_at: string;
  }[] = [];
  const { data: recentRows, error: recErr } = await supabase
    .from("user_taf_recents")
    .select("taf_id, proposed_title, pinned, visited_at")
    .eq("user_id", user.id)
    .order("pinned", { ascending: false })
    .order("visited_at", { ascending: false });
  if (!recErr && recentRows) {
    recents = recentRows as unknown as {
      taf_id: string;
      proposed_title: string | null;
      pinned: boolean;
      visited_at: string;
    }[];
  }

  const pinned: DashboardTaf[] = [];
  const recent: DashboardTaf[] = [];
  for (const r of recents) {
    const sim = scoreByTaf.get(r.taf_id)?.latest ?? 0;
    const entry: DashboardTaf = {
      tafId: r.taf_id,
      title: r.proposed_title || "Untitled",
      status: "",
      createdAt: r.visited_at || "",
      similarity: sim,
    };
    if (r.pinned) {
      if (pinned.length < 6) pinned.push(entry);
    } else if (recent.length < 5) {
      recent.push(entry);
    }
  }

  return {
    success: true,
    data: { monthlyCounts, lowest, highest, pinned, recent },
  };
}