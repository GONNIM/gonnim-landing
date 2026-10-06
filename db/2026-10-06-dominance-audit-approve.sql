-- ===========================================================================
-- 지배상식 · 감사 기록에 approve · auto_approve 를 더한다 (56차 B · D55)      2026-10-06
-- ===========================================================================
-- 승인(날짜 붙이기)을 ds_letter_audit 에 남긴다.
-- approve: 사람이 승인 창에서 승인했거나 운영자 지시로 기계가 승인함(note 에 적음).
-- auto_approve: 매일 크론의 자동 날짜 붙이기(D55).
-- 다시 실행해도 안전하다. 실행: Claude Code 가 SUPABASE_ACCESS_TOKEN 으로(scripts/dominance-sql.ts).

ALTER TABLE public.ds_letter_audit DROP CONSTRAINT IF EXISTS ds_letter_audit_event_check;
ALTER TABLE public.ds_letter_audit ADD CONSTRAINT ds_letter_audit_event_check
  CHECK (event IN ('draft', 'block_rewrite', 'cross_review', 'review_reject', 'review_pass', 'title_edit', 'approve', 'auto_approve'));

-- 검증 (기대: 한 줄 · approve · auto_approve 가 들어 있음)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ds_letter_audit'::regclass AND conname = 'ds_letter_audit_event_check';
