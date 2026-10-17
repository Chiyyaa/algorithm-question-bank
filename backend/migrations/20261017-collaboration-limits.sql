-- Raise only the existing submission limit: 30 -> 300 new questions per account per rolling hour.
-- Existing questions, membership checks, revisions, function owner and grants are preserved.
BEGIN;
DO $migration$
DECLARE
    signature regprocedure := to_regprocedure('public.save_question_submission(uuid,text,text,jsonb,boolean,integer)');
    definition text;
    old_pattern text := $pattern$>=\s*30\s+then\s+raise\s+exception\s+'SUBMISSION_LIMIT'$pattern$;
    new_pattern text := $pattern$>=\s*300\s+then\s+raise\s+exception\s+'SUBMISSION_LIMIT'$pattern$;
    match_count integer;
BEGIN
    IF signature IS NULL THEN
        RAISE EXCEPTION 'save_question_submission is missing; no changes were made';
    END IF;
    SELECT pg_get_functiondef(signature) INTO definition;
    IF definition !~* $pattern$created_at\s*>\s*now\(\)\s*-\s*interval\s*'1 hour'$pattern$ THEN
        RAISE EXCEPTION 'Unexpected rate-limit definition; no changes were made';
    END IF;
    SELECT count(*) INTO match_count FROM regexp_matches(definition, new_pattern, 'gi');
    IF match_count = 1 THEN
        RAISE NOTICE 'Submission limit is already 300 per rolling hour';
        RETURN;
    END IF;
    SELECT count(*) INTO match_count FROM regexp_matches(definition, old_pattern, 'gi');
    IF match_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one 30-question limit; no changes were made';
    END IF;
    EXECUTE regexp_replace(definition, old_pattern, '>=300 then raise exception ''SUBMISSION_LIMIT''', 'i');
    IF pg_get_functiondef(signature) !~* new_pattern THEN
        RAISE EXCEPTION 'Limit verification failed; transaction will be rolled back';
    END IF;
END
$migration$;
SELECT
    '每帳號每小時最多新增 300 題' AS setting,
    pg_get_functiondef('public.save_question_submission(uuid,text,text,jsonb,boolean,integer)'::regprocedure)
        ~* $pattern$>=\s*300\s+then\s+raise\s+exception\s+'SUBMISSION_LIMIT'$pattern$ AS hourly_limit_is_300;
COMMIT;
