"use server";


import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "@/server/actions/auth";
import { getMyGrantedPermissions } from "@/server/actions/permissions";
import { formatName } from "@/lib/constants";

// ── Types ──────────────────────────────────────────────────

export type SDGCount = {
  /** e.g. "3" */
  code: string;
  /** e.g. "Good Health & Well Being" */
  meaning: string;
  /** display label e.g. "SDG 3 — Good Health & Well Being" */
  label: string;
  count: number;
};

export type FieldCount = {
  field: string;
  count: number;
};

export type ReferencedByTaf = {
  submissionId: string;
  tafId: string;
  title: string;
  studentName: string;
  studentSrCode: string | null;
  groupName: string;
  approvedAt: string | null;
};

export type ReferencedCapstone = {
  journalId: string;
  title: string;
  authors: string;
  year: string | null;
  /** how many approved analyses reference this capstone */
  referenceCount: number;
  referencedBy: ReferencedByTaf[];
};

export type SimilarityEntry = {
  tafId: string;
  proposedTitle: string;
  studentName: string;
  studentSrCode: string | null;
  combinedScore: number;
  internalScore: number;
  externalScore: number;
  fieldOfIt: string;
  fullyApprovedAt: string;
};

export type ApprovedTaf = {
  tafId: string;
  proposedTitle: string;
  studentName: string;
  studentSrCode: string | null;
  fieldOfIt: string;
  combinedScore: number;
  internalScore: number;
  externalScore: number;
  year: string | null;
  sdgCategories: string[];
  analysisVersion: number | null;
  fullyApprovedAt: string;
};

export type AnalyticsData = {
  sdgCounts: SDGCount[];
  fieldCounts: FieldCount[];
  mostReferenced: ReferencedCapstone[];
  leastReferenced: ReferencedCapstone[];
  highestSimilarity: SimilarityEntry | null;
  lowestSimilarity: SimilarityEntry | null;
  approvedTafs: ApprovedTaf[];
};

export type AnalyticsResult =
  | { success: true; data: AnalyticsData }
  | { success: false; error: string };

// ── SDG meaning map (UN Sustainable Development Goals) ──────
const SDG_MEANINGS: Record<string, string> = {
  "1": "No Poverty",
  "2": "Zero Hunger",
  "3": "Good Health & Well Being",
  "4": "Quality Education",
  "5": "Gender Equality",
  "6": "Clean Water & Sanitation",
  "7": "Affordable & Clean Energy",
  "8": "Decent Work & Economic Growth",
  "9": "Industry, Innovation & Infrastructure",
  "10": "Reduced Inequalities",
  "11": "Sustainable Cities & Communities",
  "12": "Responsible Consumption & Production",
  "13": "Climate Action",
  "14": "Life Below Water",
  "15": "Life on Land",
  "16": "Peace, Justice & Strong Institutions",
  "17": "Partnerships for the Goals",
};

// Extract "SDG 3: ..." or "SDG 3 — ..." strings -> { code, meaning }
function parseSdg(raw: string): { code: string; meaning: string; label: string } {
  const m = raw.match(/SDG\s*(\d+)\s*[\-–:—]\s*(.*)/i);
  if (m) {
    return {
      code: m[1],
      meaning: SDG_MEANINGS[m[1]] || m[2].trim() || "Other",
      label: `SDG ${m[1]} — ${SDG_MEANINGS[m[1]] || m[2].trim() || "Other"}`,
    };
  }
  // fallback: "SDG 3" with no name
  const m2 = raw.match(/SDG\s*(\d+)/i);
  if (m2) {
    return {
      code: m2[1],
      meaning: SDG_MEANINGS[m2[1]] || "Other",
      label: `SDG ${m2[1]} — ${SDG_MEANINGS[m2[1]] || "Other"}`,
    };
  }
  return { code: raw, meaning: "Other", label: raw };
}

function parseSdgCategories(raw: string[] | null): { code: string; meaning: string; label: string }[] {
  return (raw || []).map(parseSdg);
}

// ── Main analytics fetch ───────────────────────────────────

export async function getResearchAnalytics(): Promise<AnalyticsResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const granted = await getMyGrantedPermissions();
  if (!granted.includes("analytics.view")) {
    return {
      success: false,
      error: "This account has not been granted Research Analytics.",
    };
  }

  const supabase = await createClient();

  // ── 1. Fully-approved submissions ──────────────────────
  const { data: subs, error: subErr } = await supabase
    .from("group_taf_submissions")
    .select(
      "id, taf_id, group_id, analysis_version, submitted_by, combined_score, internal_score, external_score, fully_approved_at, status",
    )
    .not("fully_approved_at", "is", null);

  if (subErr) {
    console.error("[analytics] Failed to load approved submissions:", subErr);
    return { success: false, error: "Failed to load analytics data." };
  }

  const approvedSubs = (subs || []) as any[];

  // ── 2. Collect analysis data for the approved TAFs ─────
  // (sdg, field_of_it, internal_matches, scores)
  const tafIds = Array.from(new Set(approvedSubs.map((s) => s.taf_id as string)));
  const analyses: Record<string, any> = {};
  if (tafIds.length) {
    const { data: anRows } = await supabase
      .from("taf_analysis_results")
      .select("taf_id, version_number, sdg_categories, field_of_it, internal_matches, internal_similarity_score, external_similarity_score, combined_score")
      .in("taf_id", tafIds);
    const byTaf: Record<string, any[]> = {};
    for (const r of (anRows || []) as any[]) {
      (byTaf[r.taf_id] ||= []).push(r);
    }
    const versionByTaf: Record<string, number> = {};
    for (const s of approvedSubs) {
      if (s.analysis_version != null && !(versionByTaf[s.taf_id] !== undefined)) {
        versionByTaf[s.taf_id] = s.analysis_version as number;
      }
    }
    for (const tafId of tafIds) {
      const rows = byTaf[tafId] || [];
      if (!rows.length) continue;
      const wanted = versionByTaf[tafId];
      const match = rows.find((r) => r.version_number === wanted) || rows[0];
      analyses[tafId] = match;
    }
  }

  // ── 2b. TAF titles (proposed_title) ────────────────────
  const titles: Record<string, string> = {};
  if (tafIds.length) {
    const { data: tRows } = await supabase
      .from("topic_abstract_forms")
      .select("id, proposed_title")
      .in("id", tafIds);
    for (const t of (tRows || []) as any[]) {
      titles[t.id] = t.proposed_title || "Untitled TAF";
    }
  }

  // ── 3. Student names / SR codes for authors ────────────
  const studentIds = Array.from(new Set(approvedSubs.map((s) => s.submitted_by as string)));
  const nameMap: Record<string, { name: string; sr: string | null }> = {};
  if (studentIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, first_name, middle_initial, last_name, suffix, sr_code")
      .in("id", studentIds);
    for (const p of (profs || []) as any[]) {
      const name =
        formatName({
          firstName: p.first_name,
          middleInitial: p.middle_initial,
          lastName: p.last_name,
          suffix: p.suffix,
        }) || "Student";
      nameMap[p.id] = { name, sr: p.sr_code || null };
    }
  }

  // ── 3b. Advisory-group names (for the reference drill-down) ──
  const groupIds = Array.from(
    new Set(approvedSubs.map((s) => s.group_id as string).filter(Boolean)),
  );
  const groupNameMap: Record<string, string> = {};
  if (groupIds.length) {
    const { data: grps } = await supabase
      .from("advisory_groups")
      .select("id, name")
      .in("id", groupIds);
    for (const g of (grps || []) as any[]) {
      groupNameMap[g.id] = (g.name as string) || "Group";
    }
  }

  // ── 4. Build approved TAF list + per-SDG / per-field aggregation ─
  const approvedTafs: ApprovedTaf[] = [];
  const sdgAgg: Record<string, number> = {};
  const fieldAgg: Record<string, number> = {};
  // capstone reference counting: journalId -> count
  const refCount: Record<string, ReferencedCapstone> = {};

  for (const s of approvedSubs) {
    const an = analyses[s.taf_id] as any;
    const tafId = s.taf_id as string;
    const student = nameMap[s.submitted_by as string] || { name: "Student", sr: null };

    const sdgParsed = parseSdgCategories(an?.sdg_categories as string[] | null);
    const fieldOfIt = (an?.field_of_it as string) || "Unclassified";
    const combined = parseFloat(String(an?.combined_score ?? s.combined_score)) || 0;
    const internal = parseFloat(String(an?.internal_similarity_score ?? s.internal_score)) || 0;
    const external = parseFloat(String(an?.external_similarity_score ?? s.external_score)) || 0;

    // SDG + field aggregation (only for fully approved TAFs)
    for (const sdg of sdgParsed) {
      sdgAgg[sdg.code] = (sdgAgg[sdg.code] || 0) + 1;
    }
    fieldAgg[fieldOfIt] = (fieldAgg[fieldOfIt] || 0) + 1;

    // approved row record
    approvedTafs.push({
      tafId,
      proposedTitle: titles[tafId] || "Untitled TAF",
      studentName: student.name,
      studentSrCode: student.sr,
      fieldOfIt,
      combinedScore: combined,
      internalScore: internal,
      externalScore: external,
      year: s.fully_approved_at ? String(new Date(s.fully_approved_at).getFullYear()) : null,
      sdgCategories: (an?.sdg_categories as string[]) || [],
      analysisVersion: s.analysis_version as number | null,
      fullyApprovedAt: s.fully_approved_at as string,
    });

    // capstone referencing (internal matches → journals)
    const matches = (an?.internal_matches as any[]) || [];
    for (const mc of matches) {
      const jid = (mc.journalId || mc.journal_id || "") as string;
      if (!jid) continue;
      const by = {
        submissionId: (s.id as string) || "",
        tafId,
        title: titles[tafId] || "Untitled TAF",
        studentName: student.name,
        studentSrCode: student.sr,
        groupName: groupNameMap[s.group_id as string] || "Group",
        approvedAt: (s.fully_approved_at as string) || null,
      };
      const cur = refCount[jid];
      if (cur) {
        if (!cur.referencedBy.some((r) => r.submissionId === by.submissionId)) {
          cur.referencedBy.push(by);
          cur.referenceCount += 1;
        }
      } else {
        refCount[jid] = {
          journalId: jid,
          title: (mc.title || mc.proposedTitle || "Untitled") as string,
          authors: (mc.authors || mc.studentName || "") as string,
          year: (mc.year != null ? String(mc.year) : null) as string | null,
          referenceCount: 1,
          referencedBy: [by],
        };
      }
    }
  }

  const capstones = Object.values(refCount);

  // Most referenced: highest reference count first
  const mostReferenced = [...capstones]
    .sort((a, b) => b.referenceCount - a.referenceCount)
    .slice(0, 5);
  // Least referenced: lowest (>=1) first
  const leastReferenced = [...capstones]
    .sort((a, b) => a.referenceCount - b.referenceCount)
    .slice(0, 5);

  // SDG counts (numerically ordered 1..17)
  const sdgCounts: SDGCount[] = Object.entries(sdgAgg)
    .map(([code, count]) => ({
      code,
      meaning: SDG_MEANINGS[code] || "Other",
      label: `SDG ${code} — ${SDG_MEANINGS[code] || "Other"}`,
      count,
    }))
    .sort((a, b) => parseInt(a.code) - parseInt(b.code));

  // Field counts (descending)
  const fieldCounts: FieldCount[] = Object.entries(fieldAgg)
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count);

  // Highest / lowest combined similarity among approved TAFs
  const sortedByCombined = [...approvedTafs]
    .filter((t) => t.combinedScore > 0)
    .sort((a, b) => b.combinedScore - a.combinedScore);
  const highest = sortedByCombined[0] || null;
  const lowest = sortedByCombined[sortedByCombined.length - 1] || null;
  const similarityEntries = (t: ApprovedTaf | null): SimilarityEntry | null =>
    t
      ? {
          tafId: t.tafId,
          proposedTitle: t.proposedTitle,
          studentName: t.studentName,
          studentSrCode: t.studentSrCode,
          combinedScore: t.combinedScore,
          internalScore: t.internalScore,
          externalScore: t.externalScore,
          fieldOfIt: t.fieldOfIt,
          fullyApprovedAt: t.fullyApprovedAt,
        }
      : null;

  return {
    success: true,
    data: {
      sdgCounts,
      fieldCounts,
      mostReferenced,
      leastReferenced,
      highestSimilarity: similarityEntries(highest),
      lowestSimilarity: similarityEntries(lowest),
      approvedTafs,
    },
  };
}