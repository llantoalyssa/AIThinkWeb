-- ============================================================
-- 024: SECURITY DEFINER approval state-transition function
-- ------------------------------------------------------------
-- Each of the approval / return / resubmit writes on
-- group_taf_submissions previously failed with "new row violates
-- row-level security policy" (42501), because RLS UPDATE policies
-- with conflicting WITH CHECK clauses blocked the current_approver_role
-- transition. These writes now go through this SECURITY DEFINER
-- function (owner privileges), bypassing RLS for those structured
-- writes. RLS stays enabled for reads.
--
-- The caller (a server action) is the AUTHORIZATION point: it verifies
-- WHO may act (the current user's role + ownership) and at WHICH stage,
-- then passes a JSON map { column: value } of ONLY the columns it wants
-- changed. This function sets exactly those columns.
--
-- Safety: column names come from a hard-coded whitelist (a PL/pgSQL
-- array of {json_key, sql_set} pairs) — never from dynamic identifiers.
-- Only the JSON *values* are interpolated, via parameter $1. Setting a
-- column to NULL works (the key being present with a null value writes
-- NULL), which matters for resubmit (clearing returned_* and approver
-- decisions).
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_taf_workflow_update(
  p_submission_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_json   jsonb;
  v_set    text := '';
  v_parts  text[];
  v_entry  record;
  v_sql    text;
BEGIN
  -- Whitelist of (json key -> SQL assignment). Each value is read from
  -- $1 with an explicit cast matching the target column type so no
  -- implicit-type errors occur. jsonb keys use ->> operator for base
  -- types and -> for nested jsonb.
  FOR v_entry IN
    SELECT col, ex FROM (VALUES
      ('status',                    '$1->>''status'''),
      ('current_approver_role',     '$1->>''current_approver_role'''),
      ('approval_route',            '$1->''approval_route'''),
      ('approver_1',                '($1->>''approver_1'')::uuid'),
      ('approver_2',                '($1->>''approver_2'')::uuid'),
      ('approver_3',                '($1->>''approver_3'')::uuid'),
      ('approver_4',                '($1->>''approver_4'')::uuid'),
      ('approver_1_status',         '$1->>''approver_1_status'''),
      ('approver_1_decision_note',  '$1->>''approver_1_decision_note'''),
      ('approver_1_decided_at',     '($1->>''approver_1_decided_at'')::timestamptz'),
      ('approver_2_status',         '$1->>''approver_2_status'''),
      ('approver_2_decision_note',  '$1->>''approver_2_decision_note'''),
      ('approver_2_decided_at',     '($1->>''approver_2_decided_at'')::timestamptz'),
      ('approver_3_status',         '$1->>''approver_3_status'''),
      ('approver_3_decision_note',  '$1->>''approver_3_decision_note'''),
      ('approver_3_decided_at',     '($1->>''approver_3_decided_at'')::timestamptz'),
      ('approver_4_status',         '$1->>''approver_4_status'''),
      ('approver_4_decision_note',  '$1->>''approver_4_decision_note'''),
      ('approver_4_decided_at',     '($1->>''approver_4_decided_at'')::timestamptz'),
      ('fully_approved_at',         '($1->>''fully_approved_at'')::timestamptz'),
      ('returned_reason',           '$1->>''returned_reason'''),
      ('returned_by',               '($1->>''returned_by'')::uuid'),
      ('returned_at',               '($1->>''returned_at'')::timestamptz'),
      ('resubmitted_at',            '($1->>''resubmitted_at'')::timestamptz'),
      ('taf_snapshot',              '$1->''taf_snapshot'''),
      ('analysis_version',          '($1->>''analysis_version'')::int'),
      ('internal_score',            '($1->>''internal_score'')::float8'),
      ('external_score',            '($1->>''external_score'')::float8'),
      ('combined_score',            '($1->>''combined_score'')::float8'),
      ('judgment',                  '$1->>''judgment''')
    ) AS t(col, ex)
  LOOP
    -- Only include the column if the caller supplied that key.
    IF p_updates ? v_entry.col THEN
      v_parts := array_append(v_parts, v_entry.col || ' = ' || v_entry.ex);
    END IF;
  END LOOP;

  IF array_length(v_parts, 1) IS NULL THEN
    RAISE EXCEPTION 'No updatable columns provided for submission %', p_submission_id;
  END IF;

  v_set := array_to_string(v_parts, ', ');

  v_sql := format(
    'UPDATE public.group_taf_submissions SET %s WHERE id = $2 RETURNING to_jsonb(group_taf_submissions)',
    v_set
  );

  EXECUTE v_sql
    INTO v_json
    USING p_updates, p_submission_id;

  IF v_json IS NULL THEN
    RAISE EXCEPTION 'No row updated for submission %', p_submission_id;
  END IF;

  RETURN v_json;
END;
$$;

-- Grant execution so the anon-key server role can call it.
GRANT EXECUTE ON FUNCTION public.apply_taf_workflow_update(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_taf_workflow_update(uuid, jsonb) TO service_role;