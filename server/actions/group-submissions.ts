"use server";

import { createClient } from "@/server/supabase/server";
import { getCurrentUser } from "./auth";
import { logAudit } from "@/server/audit";
import { notify } from "./approval-workflow";
import { plainTextToHtml } from "@/lib/html";
import { HIGH_SIMILARITY_THRESHOLD } from "@/lib/constants";
import type { FormFieldsSnapshot } from "./analyze-taf";
import type { InternalMatchDisplay, ExternalMatchDisplay, ScoringBreakdown } from "./analyze-taf";
export type EligibleVersion = {
  versionNumber: number;
  combinedScore: number;
  judgment: "high_similarity" | "low_similarity";
  analyzedAt: string;
};

export type AvailableTAF = {
  tafId: string;
  proposedTitle: string;
  updatedAt: string;
  eligibleVersions: EligibleVersion[];
};

export type AvailableTAFsResult =
  | { success: true; data: AvailableTAF[] }
  | { success: false; error: string };

export type GroupSubmission = {
  id: string;
  groupId: string;
  groupName: string;
  tafId: string;
  tafSnapshot: FormFieldsSnapshot;
  analysisVersion: number;
  combinedScore: number;
  judgment: string;
  status: "pending" | "under_review" | "approved" | "revisions_needed" | "rejected";
  submittedAt: string;
  submittedBy: string;

  studentName?: string;
  studentSrCode?: string;

  approver_1: string | null;
  approver_2: string | null;
  approver_3: string | null;
  approver_4: string | null;
  approver_1_status: string | null;
  approver_2_status: string | null;
  approver_3_status: string | null;
  approver_4_status: string | null;
};

export type GroupSubmissionsResult =
  | { success: true; data: GroupSubmission[] }
  | { success: false; error: string };

export type SubmitTAFResult =
  | { success: true; submissionId: string; message: string }
  | { success: false; error: string };

type RawSubmission = Record<string, unknown>;
function mapSubmission(
  row: RawSubmission,
  studentName?: string,
  studentSrCode?: string,
  groupName?: string,
): GroupSubmission {
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    groupName: groupName || '',
    tafId: row.taf_id as string,
    tafSnapshot: row.taf_snapshot as unknown as FormFieldsSnapshot,
    analysisVersion: row.analysis_version as number,
    combinedScore: row.combined_score as number,
    judgment: row.judgment as string,
    status: row.status as GroupSubmission["status"],
    submittedAt: row.submitted_at as string,
    submittedBy: row.submitted_by as string,
    studentName,
    studentSrCode,
    approver_1: (row.approver_1 as string) || null,
    approver_2: (row.approver_2 as string) || null,
    approver_3: (row.approver_3 as string) || null,
    approver_4: (row.approver_4 as string) || null,
    approver_1_status: (row.approver_1_status as string) || null,
    approver_2_status: (row.approver_2_status as string) || null,
    approver_3_status: (row.approver_3_status as string) || null,
    approver_4_status: (row.approver_4_status as string) || null,
  };
}
export async function getStudentAvailableTAFs(
  groupId?: string,
): Promise<AvailableTAFsResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "student") {
    return { success: false, error: "Only students can view available TAFs." };
  }

  const supabase = await createClient();
  const { data: tafs, error: tafErr } = await supabase
    .from("topic_abstract_forms")
    .select("id, proposed_title, updated_at")
    .eq("student_id", user.id)
    .order("updated_at", { ascending: false });

  if (tafErr) {
    console.error("Error fetching TAFs:", tafErr);
    return { success: false, error: "Failed to fetch TAFs." };
  }

  if (!tafs || tafs.length === 0) {
    return { success: true, data: [] };
  }
  let excludedTafIds = new Set<string>();
  if (groupId) {
    const { data: existingSubs } = await supabase
      .from("group_taf_submissions")
      .select("taf_id")
      .eq("group_id", groupId)
      .eq("submitted_by", user.id);

    if (existingSubs && existingSubs.length > 0) {
      excludedTafIds = new Set(existingSubs.map((s) => s.taf_id as string));
    }
  }
  const tafIds = tafs.map((t) => t.id);
  const { data: analyses, error: analysisErr } = await supabase
    .from("taf_analysis_results")
    .select("taf_id, version_number, combined_score, judgment, analyzed_at")
    .in("taf_id", tafIds)
    .order("version_number", { ascending: false });

  if (analysisErr) {
    console.error("Error fetching analysis results:", analysisErr);
    return { success: false, error: "Failed to fetch analysis results." };
  }
  const eligibleByTaf = new Map<string, EligibleVersion[]>();

  if (analyses) {
    for (const row of analyses) {
      const tafId = row.taf_id as string;
      const combinedScore = parseFloat(String(row.combined_score)) || 0;
      const judgment = row.judgment as string;
      if (judgment === "low_similarity" || combinedScore < HIGH_SIMILARITY_THRESHOLD) {
        if (!eligibleByTaf.has(tafId)) {
          eligibleByTaf.set(tafId, []);
        }
        eligibleByTaf.get(tafId)!.push({
          versionNumber: row.version_number as number,
          combinedScore,
          judgment: judgment as "low_similarity" | "high_similarity",
          analyzedAt: row.analyzed_at as string,
        });
      }
    }
  }
  const available: AvailableTAF[] = [];
  for (const taf of tafs) {

    if (excludedTafIds.has(taf.id)) continue;
    const versions = eligibleByTaf.get(taf.id);
    if (versions && versions.length > 0) {
      available.push({
        tafId: taf.id,
        proposedTitle: taf.proposed_title || "Untitled",
        updatedAt: taf.updated_at || "",
        eligibleVersions: versions,
      });
    }
  }

  return { success: true, data: available };
}
export async function submitTAFToGroup(
  groupId: string,
  tafId: string,
  analysisVersion: number,
): Promise<SubmitTAFResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "student") {
    return { success: false, error: "Only students can submit TAFs." };
  }

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("student_group_memberships")
    .select("id")
    .eq("student_id", user.id)
    .eq("group_id", groupId)
    .single();

  if (!membership) {
    return { success: false, error: "You are not a member of this group." };
  }
  const { data: taf } = await supabase
    .from("topic_abstract_forms")
    .select("id, proposed_title, background, objectives, literature_review, methodology, reference_list")
    .eq("id", tafId)
    .eq("student_id", user.id)
    .single();

  if (!taf) {
    return { success: false, error: "TAF not found or you don't have access." };
  }
  const { data: analysis } = await supabase
    .from("taf_analysis_results")
    .select("version_number, combined_score, judgment, form_fields_snapshot, enhancement, internal_similarity_score, external_similarity_score")
    .eq("taf_id", tafId)
    .eq("version_number", analysisVersion)
    .single();

  if (!analysis) {
    return { success: false, error: "Analysis version not found. Please analyze your TAF first." };
  }

  const combinedScore = parseFloat(String(analysis.combined_score)) || 0;
  const judgment = analysis.judgment as string;

  if (judgment !== "low_similarity" && combinedScore >= HIGH_SIMILARITY_THRESHOLD) {
    return {
      success: false,
      error: `This TAF version has a similarity score of ${combinedScore}%, which is at or above the ${HIGH_SIMILARITY_THRESHOLD}% threshold. Please revise and re-analyze.`,
    };
  }
  let tafSnapshot: FormFieldsSnapshot;

  const enhancement = analysis.enhancement as unknown as
    | {
        improvedTitle: string;
        improvedBackground: string;
        improvedObjectives: string;
        improvedMethodology: string;
        improvedLiteratureReview: string;
        improvedReferences: string;
      }
    | null
    | undefined;

  if (enhancement) {
    tafSnapshot = {
      proposedTitle: enhancement.improvedTitle || taf.proposed_title || "",
      background: plainTextToHtml(enhancement.improvedBackground) || taf.background || "",
      objectives: plainTextToHtml(enhancement.improvedObjectives) || taf.objectives || "",
      literatureReview:
        plainTextToHtml(enhancement.improvedLiteratureReview) ||
        taf.literature_review ||
        "",
      methodology:
        plainTextToHtml(enhancement.improvedMethodology) || taf.methodology || "",
      referenceList: plainTextToHtml(enhancement.improvedReferences) || taf.reference_list || "",
    };
  } else if (analysis.form_fields_snapshot) {
    const ff = analysis.form_fields_snapshot as unknown as Record<string, unknown>;
    tafSnapshot = {
      proposedTitle: (ff.proposedTitle as string) || taf.proposed_title || "",
      background: plainTextToHtml((ff.background as string) || "") || taf.background || "",
      objectives: plainTextToHtml((ff.objectives as string) || "") || taf.objectives || "",
      literatureReview:
        plainTextToHtml((ff.literatureReview as string) || "") ||
        taf.literature_review ||
        "",
      methodology: (ff.methodology as string) || taf.methodology || "",
      referenceList: plainTextToHtml((ff.referenceList as string) || "") || taf.reference_list || "",
    };
  } else {
    tafSnapshot = {
      proposedTitle: taf.proposed_title || "",
      background: taf.background || "",
      objectives: taf.objectives || "",
      literatureReview: taf.literature_review || "",
      methodology: taf.methodology || "",
      referenceList: taf.reference_list || "",
    };
  }
  const { data: submission, error: insertErr } = await supabase
    .from("group_taf_submissions")
    .insert({
      group_id: groupId,
      taf_id: tafId,
      taf_snapshot: tafSnapshot,
      analysis_version: analysisVersion,
      internal_score: parseFloat(String(analysis.internal_similarity_score)) || 0,
      external_score: parseFloat(String(analysis.external_similarity_score)) || 0,
      combined_score: combinedScore,
      judgment,
      status: "pending",
      submitted_by: user.id,
      current_approver_role: "adviser",
    })
    .select()
    .single();

  if (insertErr) {

    if (insertErr.code === "23505") {
      return { success: false, error: "This TAF has already been submitted to this group." };
    }
    console.error("Error submitting TAF to group:", insertErr);
    return { success: false, error: "Failed to submit TAF. Please try again." };
  }
  const { data: groupRow } = await supabase
    .from("advisory_groups")
    .select("adviser_id, name")
    .eq("id", groupId)
    .single();
  const adviserId = (groupRow?.adviser_id as string) || null;
  const groupName = (groupRow?.name as string) || null;
  if (adviserId && submission) {
    await notify(
      adviserId,
      submission.id as string,
      "taf_submitted",
      `${user.firstName || "A student"} submitted a TAF for your review${groupName ? ` (${groupName})` : ""}.`,
    );
  }
  await logAudit({
    action: "taf_submitted",
    entityType: "taf_submission",
    entityId: (submission?.id as string) ?? null,
    entityLabel: (taf.proposed_title as string) || null,
    description: `Submitted "${
      (taf.proposed_title as string) || "a TAF"
    }" for review${groupName ? ` in ${groupName}` : ""}.`,
    metadata: { groupId, groupName, tafId, analysisVersion },
  });

  return {
    success: true,
    submissionId: submission?.id as string,
    message: "TAF submitted successfully to the advisory group.",
  };
}
export async function getMyGroupSubmissions(
  groupId: string,
): Promise<GroupSubmissionsResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "student") {
    return { success: false, error: "Only students can view group submissions." };
  }

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("student_group_memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("student_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { success: false, error: "You're not a member of this advisory group." };
  }
  const { data, error } = await supabase
    .from("group_taf_submissions")
    .select("*")
    .eq("group_id", groupId)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Error fetching submissions:", error);
    return { success: false, error: "Failed to fetch submissions." };
  }
  const submitterIds = [
    ...new Set((data || []).map((r) => (r as RawSubmission).submitted_by as string)),
  ];
  const profileMap = new Map<string, { first_name: string; last_name: string; sr_code: string | null }>();
  if (submitterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, sr_code")
      .in("id", submitterIds);
    for (const p of profiles || []) {
      profileMap.set(p.id, p as { first_name: string; last_name: string; sr_code: string | null });
    }
  }

  return {
    success: true,
    data: (data || []).map((row) => {
      const prof = profileMap.get((row as RawSubmission).submitted_by as string);
      const name = prof
        ? `${prof.first_name} ${prof.last_name}`.trim()
        : undefined;
      return mapSubmission(row as RawSubmission, name, prof?.sr_code || undefined);
    }),
  };
}
export async function getGroupSubmissions(
  groupId: string,
): Promise<GroupSubmissionsResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  if (user.role !== "adviser") {
    return { success: false, error: "Only advisers can view all group submissions." };
  }

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("advisory_groups")
    .select("id")
    .eq("id", groupId)
    .eq("adviser_id", user.id)
    .single();

  if (!group) {
    return { success: false, error: "Group not found or you don't have access." };
  }
  const { data, error } = await supabase
    .from("group_taf_submissions")
    .select("*")
    .eq("group_id", groupId)
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Error fetching submissions:", error);
    return { success: false, error: "Failed to fetch submissions." };
  }
  const submitterIds = [...new Set((data || []).map((r) => r.submitted_by as string))];
  const nameMap = new Map<string, { name: string; srCode: string }>();

  if (submitterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, sr_code")
      .in("id", submitterIds) as { data: { id: string; first_name: string; last_name: string; sr_code: string | null }[] | null };

    if (profiles) {
      for (const p of profiles) {
        nameMap.set(p.id, {
          name: `${p.first_name} ${p.last_name}`.trim(),
          srCode: p.sr_code || "—",
        });
      }
    }
  }

  return {
    success: true,
    data: (data || []).map((row) => {
      const info = nameMap.get(row.submitted_by as string);
      return mapSubmission(
        row as RawSubmission,
        info?.name,
        info?.srCode,
      );
    }),
  };
}
export type ApproverStepInfo = {
  role: string;
  label: string;
  status: string | null;
  note: string | null;
  decidedAt: string | null;
};

export type SubmissionWithAnalysis = GroupSubmission & {
  currentApproverRole: string | null;
  approvalRoute: string[] | null;
  returnedReason: string | null;
  returnedAt: string | null;
  fullyApprovedAt: string | null;

  approverSteps: ApproverStepInfo[];
  internalScore: number;
  externalScore: number;
  internalMatches: InternalMatchDisplay[];
  externalMatches: ExternalMatchDisplay[];
  sdgCategories: string[];
  fieldOfIt: string;
  researchGapAnalysis: string;
  internalSimilarity: number;
  externalSimilarity: number;
  scoringBreakdown: ScoringBreakdown | null;
};

export type SubmissionDetailResult =
  | { success: true; data: SubmissionWithAnalysis }
  | { success: false; error: string };

export async function getSubmissionById(
  submissionId: string,
): Promise<SubmissionDetailResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("group_taf_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();

  if (error || !data) {
    return { success: false, error: "Submission not found." };
  }
  let groupName = '';
  const { data: groupRow } = await supabase
    .from("advisory_groups")
    .select("name")
    .eq("id", data.group_id)
    .single();
  if (groupRow) {
    groupName = (groupRow as { name: string }).name;
  }
  const analysisData: Omit<SubmissionWithAnalysis, keyof GroupSubmission> = {
    currentApproverRole: null,
    approvalRoute: null,
    returnedReason: null,
    returnedAt: null,
    fullyApprovedAt: null,
    approverSteps: [],
    internalScore: 0,
    externalScore: 0,
    internalMatches: [] as InternalMatchDisplay[],
    externalMatches: [] as ExternalMatchDisplay[],
    sdgCategories: [] as string[],
    fieldOfIt: '',
    researchGapAnalysis: '',
    internalSimilarity: 0,
    externalSimilarity: 0,
    scoringBreakdown: null,
  };

  const { data: analysisRows } = await supabase
    .from("taf_analysis_results")
    .select("internal_matches, external_matches, sdg_categories, field_of_it, research_gap_analysis, internal_similarity_score, external_similarity_score, scoring_breakdown")
    .eq("taf_id", data.taf_id)
    .eq("version_number", data.analysis_version)
    .maybeSingle();

  if (analysisRows) {
    const row = analysisRows as Record<string, unknown>;
    analysisData.internalMatches = (row.internal_matches as unknown as InternalMatchDisplay[]) || [];
    analysisData.externalMatches = (row.external_matches as unknown as ExternalMatchDisplay[]) || [];
    analysisData.sdgCategories = (row.sdg_categories as string[]) || [];
    analysisData.fieldOfIt = (row.field_of_it as string) || '';
    analysisData.researchGapAnalysis = (row.research_gap_analysis as string) || '';
    analysisData.internalSimilarity = parseFloat(String(row.internal_similarity_score)) || 0;
    analysisData.externalSimilarity = parseFloat(String(row.external_similarity_score)) || 0;
    analysisData.scoringBreakdown = row.scoring_breakdown
      ? (row.scoring_breakdown as unknown as ScoringBreakdown)
      : null;
  }
  const stepLabels: Record<number, string> = {
    1: "Adviser",
    2: "Associate Dean",
    3: "Dean",
    4: "VCRDES",
  };
  const approverSteps: ApproverStepInfo[] = [1, 2, 3, 4].map((n) => ({
    role:
      n === 1 ? "adviser" : n === 2 ? "associate_dean" : n === 3 ? "dean" : "vcrdes",
    label: stepLabels[n],
    status: (data[`approver_${n}_status`] as string) || null,
    note: (data[`approver_${n}_decision_note`] as string) || null,
    decidedAt: (data[`approver_${n}_decided_at`] as string) || null,
  }));
  const routingData = {
    currentApproverRole: (data.current_approver_role as string) || null,
    approvalRoute: (data.approval_route as string[]) || null,
    returnedReason: (data.returned_reason as string) || null,
    returnedAt: (data.returned_at as string) || null,
    fullyApprovedAt: (data.fully_approved_at as string) || null,
    approverSteps,
  };
  if (user.role === "student") {
    const { data: member } = await supabase
      .from("student_group_memberships")
      .select("id")
      .eq("group_id", data.group_id)
      .eq("student_id", user.id)
      .maybeSingle();

    if (!member) {
      return { success: false, error: "You don't have access to this submission." };
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, sr_code")
      .eq("id", data.submitted_by)
      .single() as { data: { first_name: string; last_name: string; sr_code: string | null } | null };

    const studentName = profile
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : undefined;
    const studentSrCode = profile?.sr_code || undefined;

    return {
      success: true,
      data: {
        ...mapSubmission(data as RawSubmission, studentName, studentSrCode, groupName),
        ...analysisData,
        ...routingData,
      },
    };
  }

  if (
    user.role === "associate_dean" ||
    user.role === "dean" ||
    user.role === "vcrdes"
  ) {
    const routedToMe = data.current_approver_role === user.role;
    const approved = !!data.fully_approved_at;
    if (!routedToMe && !approved) {
      return {
        success: false,
        error: "This TAF has not been routed to you yet.",
      };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, sr_code")
      .eq("id", data.submitted_by)
      .single() as { data: { first_name: string; last_name: string; sr_code: string | null } | null };

    const studentName = profile
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : undefined;
    const studentSrCode = profile?.sr_code || undefined;

    return {
      success: true,
      data: {
        ...mapSubmission(data as RawSubmission, studentName, studentSrCode, groupName),
        ...analysisData,
        ...routingData,
      },
    };
  }

  if (user.role === "adviser") {
    const { data: group } = await supabase
      .from("advisory_groups")
      .select("id")
      .eq("id", data.group_id)
      .eq("adviser_id", user.id)
      .single();

    if (!group) {
      return { success: false, error: "You don't have access to this submission." };
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, sr_code")
      .eq("id", data.submitted_by)
      .single() as { data: { first_name: string; last_name: string; sr_code: string | null } | null };

    const studentName = profile
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : undefined;
    const studentSrCode = profile?.sr_code || undefined;

    return {
      success: true,
      data: {
        ...mapSubmission(data as RawSubmission, studentName, studentSrCode, groupName),
        ...analysisData,
        ...routingData,
      },
    };
  }

  return {
    success: true,
    data: {
      ...mapSubmission(data as RawSubmission, undefined, undefined, groupName),
      ...analysisData,
      ...routingData,
    },
  };
}
export async function hasTAFGroupSubmissions(
  tafId: string,
): Promise<
  | { success: true; hasSubmissions: boolean; submissionId?: string; groupId?: string; groupSlug?: string; status?: string }
  | { success: false; error: string }
> {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("group_taf_submissions")
    .select("id, group_id, status")
    .eq("taf_id", tafId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error checking TAF submissions:", error);
    return { success: false, error: "Failed to check submissions." };
  }

  if (!data) {
    return { success: true, hasSubmissions: false };
  }
  let groupSlug = '';
  const { data: groupRow } = await supabase
    .from("advisory_groups")
    .select("name")
    .eq("id", data.group_id)
    .single();
  if (groupRow) {
    const name = (groupRow as { name: string }).name;
    groupSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  return {
    success: true,
    hasSubmissions: true,
    submissionId: data.id as string,
    groupId: data.group_id as string,
    groupSlug,
    status: data.status as string,
  };
}