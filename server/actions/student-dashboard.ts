"use server";

// ============================================================
// Student dashboard data action — aggregates everything the student
// dashboard needs in one call:
//   • monthly total-TAF counts (for the line chart, month filterable)
//   • the user's lowest- and highest-similarity TAFs
//   • pinned TAFs and most-recent TAFs (with similarity + title)
// ============================================================

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "./auth";

export type DashboardTaf = {
  tafId: string;
  title: string;
  status: string;
  createdAt: string;
  similarity: number; // latest/lowest per the analysis result
};

export type StudentDashboardData = {
  /** Total TAFs generated per calendar month (YYYY-MM) EXCLUDING
   *  months with zero, or including all requested months. */
  monthlyCounts: { month: string; count: number }[];
  /** The lowest-similarity TAF across all analyzed versions. */
  lowest: DashboardTaf | null;
  /** The highest-similarity TAF across all analyzed versions. */
  highest: DashboardTaf | null;
  /** Pinned TAFs (most recently visited first). */
  pinned: DashboardTaf[];
  /** Most recent TAFs (most recently visited first, 5). */
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

  // 1. All of the student's TAFs
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

  // 2. Analysis scores for these TAFs (latest version per TAF). Each TAF
  //    may have many analysis rows; pick the LOWEST combined_score per TAF
  //    after fetching the most recent row(s). We fetch all and reduce.
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

  // map taf_id -> { lowest & latest combined score across versions }
  // analysisRows come sorted analyzed_at DESC, so the FIRST occurrence of a
  // taf_id is its LATEST version. On first sight we set latest=s; subsequent
  // rows only lower `lowest`. This gives both correctly.
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

  // 3. Lowest & highest similarity TAF (use lowest score representative of
  //    the TAF's best result; tie-break by most recently updated).
  let lowest: DashboardTaf | null = null;
  let highest: DashboardTaf | null = null;
  for (const t of tafRows) {
    const sc = scoreByTaf.get(t.id)?.lowest;
    if (sc === undefined) continue; // only TAFs that were analyzed
    const d = build(t, sc);
    if (!lowest || sc < lowest.similarity) lowest = d;
    if (!highest || sc > highest.similarity) highest = d;
  }

  // 4. Monthly counts for the line chart — SUBMITTED TAFs only.
  // A TAF counts once it has been submitted to a group (group_taf_submissions
  // row owned by this student). We chart by the SUBMISSION month, not the TAF
  // creation month, so the line reflects actual submitted-TAF activity.
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
    if (!subDate) continue; // not submitted → excluded from the line chart
    const key = subDate.slice(0, 7); // YYYY-MM (submission month)
    if (key && key.includes("-")) {
      monthly.set(key, (monthly.get(key) || 0) + 1);
    }
  }
  // Build a CONTINUOUS monthly series from the first submission month to the
  // last, filling months with no submissions as 0. Plotting only the months
  // that had data collapsed the gaps, so the line jumped between unrelated
  // dates — now every point sits on its real month and the line follows the
  // actual submission timeline.
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
      // Malformed keys — fall back to the sparse list.
      monthlyCounts.push(
        ...Array.from(monthly.entries())
          .map(([month, count]) => ({ month, count }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      );
    }
  }

  // 5. Pinned + recent from user_taf_recents
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