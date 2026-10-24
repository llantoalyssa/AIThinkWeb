"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";

export type CostLogEntry = {
  id: string;
  userId: string;
  userName: string;
  tafTitle: string;
  versionNumber: number | null;
  source: string;
  aiProvider: string;
  aiModel: string;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiCost: number;
  serpapiCalls: number;
  serpapiCost: number;
  totalCost: number;
  analyzedAt: string;
};

export type CostLogsResult =
  | { success: true; logs: CostLogEntry[]; total: number }
  | { success: false; error: string };

export async function getCostLogs(
  limit = 50,
  offset = 0,
): Promise<CostLogsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from("analysis_cost_logs")
    .select(
      `id,
       user_id,
       taf_id,
       title,
       version_number,
       source,
       ai_provider,
       ai_model,
       ai_input_tokens,
       ai_output_tokens,
       ai_cost,
       serpapi_calls,
       serpapi_cost,
       total_cost,
       analyzed_at`,
      { count: "exact" },
    )
    .order("analyzed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[getCostLogs] Error:", error);
    return {
      success: false,
      error: `Failed to fetch cost logs: ${error.message}`,
    };
  }

  const userIds = [...new Set((data || []).map((r) => r.user_id))];
  const tafIds = [...new Set((data || []).map((r) => r.taf_id).filter(Boolean))];

  const [profilesRes, tafsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", userIds),
    supabase
      .from("topic_abstract_forms")
      .select("id, proposed_title")
      .in("id", tafIds),
  ]);

  const nameMap = new Map<string, string>();
  if (profilesRes.data) {
    for (const p of profilesRes.data) {
      nameMap.set(p.id, `${p.first_name} ${p.last_name}`.trim() || "Unknown");
    }
  }

  const titleMap = new Map<string, string>();
  if (tafsRes.data) {
    for (const t of tafsRes.data) {
      titleMap.set(t.id, t.proposed_title || "Untitled");
    }
  }

  const logs: CostLogEntry[] = (data || []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: nameMap.get(r.user_id) || "Unknown",
    tafTitle:
      r.title ||
      titleMap.get(r.taf_id) ||
      (r.source === "journal" ? "Journal metadata extraction" : "(deleted)"),
    versionNumber: r.version_number ?? null,
    source: r.source || "taf_analyze",
    aiProvider: r.ai_provider || "opencode-go",
    aiModel: r.ai_model || "deepseek-v4-flash",
    aiInputTokens: r.ai_input_tokens || 0,
    aiOutputTokens: r.ai_output_tokens || 0,
    aiCost: Number(r.ai_cost) || 0,
    serpapiCalls: r.serpapi_calls || 0,
    serpapiCost: Number(r.serpapi_cost) || 0,
    totalCost: Number(r.total_cost) || 0,
    analyzedAt: r.analyzed_at,
  }));

  return { success: true, logs, total: count || 0 };
}