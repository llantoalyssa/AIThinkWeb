"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "./auth";

export type RecentTAFEntry = {
  id: string;
  tafId: string;
  proposedTitle: string;
  status: string;
  visitedAt: string;
  pinned: boolean;
};

type RawRecent = {
  id: string;
  taf_id: string;
  proposed_title: string;
  status: string;
  visited_at: string;
  pinned: boolean;
};

function mapRecent(raw: RawRecent): RecentTAFEntry {
  return {
    id: raw.id,
    tafId: raw.taf_id,
    proposedTitle: raw.proposed_title,
    status: raw.status,
    visitedAt: raw.visited_at,
    pinned: raw.pinned,
  };
}
export async function getUserRecentTAFs(): Promise<
  { success: true; data: RecentTAFEntry[] } | { success: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_taf_recents")
    .select("*")
    .eq("user_id", user.id)
    .order("pinned", { ascending: false })
    .order("visited_at", { ascending: false });

  if (error) {
    console.error("Error fetching recents:", error);
    return { success: false, error: "Failed to fetch recents" };
  }

  return {
    success: true,
    data: (data as unknown as RawRecent[]).map(mapRecent),
  };
}
export async function addRecentTAF(
  tafId: string,
  proposedTitle: string,
  status: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { error } = await supabase.from("user_taf_recents").upsert(
    {
      user_id: user.id,
      taf_id: tafId,
      proposed_title: proposedTitle,
      status,
      visited_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id, taf_id",
      ignoreDuplicates: false,
    }
  );

  if (error) {
    console.error("Error adding recent:", error);
    return { success: false, error: "Failed to add recent" };
  }

  return { success: true };
}
export async function togglePinRecentTAF(
  tafId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { data, error: getError } = await supabase
    .from("user_taf_recents")
    .select("pinned")
    .eq("user_id", user.id)
    .eq("taf_id", tafId)
    .single();

  if (getError) return { success: false, error: "Not found" };

  const { error } = await supabase
    .from("user_taf_recents")
    .update({ pinned: !data.pinned })
    .eq("user_id", user.id)
    .eq("taf_id", tafId);

  if (error) return { success: false, error: "Failed to toggle pin" };
  return { success: true };
}
export async function removeRecentTAF(
  tafId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("user_taf_recents")
    .delete()
    .eq("user_id", user.id)
    .eq("taf_id", tafId);

  if (error) return { success: false, error: "Failed to remove recent" };
  return { success: true };
}
export async function updateRecentTAFTitle(
  tafId: string,
  proposedTitle: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("user_taf_recents")
    .update({ proposed_title: proposedTitle })
    .eq("user_id", user.id)
    .eq("taf_id", tafId);

  if (error) return { success: false, error: "Failed to update title" };
  return { success: true };
}
export async function updateRecentTAFStatus(
  tafId: string,
  status: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("user_taf_recents")
    .update({ status })
    .eq("user_id", user.id)
    .eq("taf_id", tafId);

  if (error) return { success: false, error: "Failed to update status" };
  return { success: true };
}