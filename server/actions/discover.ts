"use server";

// ============================================================
// Public /discover overview — TAFs submitted to the approvers
// (pending/under_review) or fully approved.
// Calls the SECURITY DEFINER function discover_public_tafs()
// (migration 045), which bypasses RLS for anonymous visitors and
// returns already-masked rows, so no sensitive name ever hits the
// client. Works logged-out via the anon PostgREST role.
// ============================================================

import { createClient } from "@/server/supabase/server";

export type DiscoverTaf = {
  title: string;
  owner: string;
  sdgCategories: string[];
  fieldOfIt: string;
  researchGap: string;
  date: string;
  status: string;
  combinedScore: number;
  /** Analysis version that was actually submitted (the low-similarity one). */
  version: number | null;
};

type RpcRow = {
  title: string | null;
  owner: string | null;
  sdg_categories: string[] | null;
  field_of_it: string | null;
  research_gap: string | null;
  date: string | null;
  status: string | null;
  combined_score: number | string | null;
  version_number: number | string | null;
};

export type DiscoverResult =
  | { success: true; data: DiscoverTaf[] }
  | { success: false; error: string };

export async function getDiscoverOverview(): Promise<DiscoverResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("discover_public_tafs");

  if (error) {
    console.error("[discover] Failed to load public overview:", error);
    return {
      success: false,
      error:
        "Could not load the public overview. Please try again later.",
    };
  }

  const rows = (data || []) as RpcRow[];
  const mapped = rows.map((r) => ({
      title: r.title || "",
      owner: r.owner || "",
      sdgCategories: r.sdg_categories || [],
      fieldOfIt: r.field_of_it || "",
      researchGap: r.research_gap || "",
      date: r.date || "",
      status: r.status || "",
      combinedScore: Number(r.combined_score) || 0,
      version:
        r.version_number === null || r.version_number === undefined
          ? null
          : Number(r.version_number),
    }));

  // Newest first. The page paginates 9 cards at a time, so the order has to be
  // decided HERE — sorting the visible page in the browser would only reorder
  // whatever slice the RPC happened to return.
  // Cards with no (or unparseable) date go last; ties break on title so the
  // order is stable between requests.
  const timestamp = (iso: string): number => {
    const time = Date.parse(iso);
    return Number.isNaN(time) ? -Infinity : time;
  };
  mapped.sort((a, b) => {
    const delta = timestamp(b.date) - timestamp(a.date);
    if (delta !== 0) return delta;
    return a.title.localeCompare(b.title);
  });

  return { success: true, data: mapped };
}