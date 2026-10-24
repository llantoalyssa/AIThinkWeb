"use server";
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
  return {
    success: true,
    data: rows.map((r) => ({
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
    })),
  };
}