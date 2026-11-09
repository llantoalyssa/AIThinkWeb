alter table public.taf_analysis_results
  add column if not exists evidence_review_status text not null default 'not_reviewed',
  add column if not exists evidence_review jsonb,
  add column if not exists analysis_execution jsonb,
  add column if not exists next_action text;

alter table public.taf_analysis_results
  add constraint taf_analysis_results_evidence_review_status_check
  check (evidence_review_status in (
    'not_reviewed',
    'completed',
    'insufficient_evidence',
    'unavailable',
    'invalid'
  ));

alter table public.taf_analysis_results
  add constraint taf_analysis_results_next_action_check
  check (next_action is null or next_action in (
    'eligible_for_submission',
    'revision_required',
    'adviser_review_required',
    'analysis_incomplete'
  ));
