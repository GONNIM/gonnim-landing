-- ===========================================================================
-- 지배상식 · 감사 기록에 review_submit · approve_cancel 을 더한다 (65차 A)    2026-10-16
-- ===========================================================================
-- review_submit: ③ 「작성 완료」(draft → review). 「기록」 화면의 「작성 완료」 칸이 이 시각을 읽는다.
-- approve_cancel: ⑤ 「승인 취소」(approved → reviewed). prompt_input 에 취소 전 발행일을 적는다.
-- 다시 실행해도 안전하다. 실행: Claude Code 가 SUPABASE_ACCESS_TOKEN 으로(scripts/dominance-sql.ts).

ALTER TABLE public.ds_letter_audit DROP CONSTRAINT IF EXISTS ds_letter_audit_event_check;
ALTER TABLE public.ds_letter_audit ADD CONSTRAINT ds_letter_audit_event_check
  CHECK (event IN ('draft', 'block_rewrite', 'cross_review', 'review_reject', 'review_pass', 'title_edit', 'approve', 'auto_approve', 'review_submit', 'approve_cancel'));

-- 검증 (기대: 한 줄 · review_submit · approve_cancel 이 들어 있음)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ds_letter_audit'::regclass AND conname = 'ds_letter_audit_event_check';
