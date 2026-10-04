-- ===========================================================================
-- 지배상식 · 감사 기록에 title_edit 을 더한다 (48차 A · D51)                2026-10-04
-- ===========================================================================
-- ④ 리뷰 화면에서 제목 · 한 문장 요약만 고칠 수 있게 했다(상태는 바뀌지 않음).
-- 그 기록을 ds_letter_audit 에 event 'title_edit' 으로 남긴다. 다시 실행해도 안전하다.
-- 실행: Claude Code 가 SUPABASE_ACCESS_TOKEN 으로(scripts/dominance-sql.ts).

ALTER TABLE public.ds_letter_audit DROP CONSTRAINT IF EXISTS ds_letter_audit_event_check;
ALTER TABLE public.ds_letter_audit ADD CONSTRAINT ds_letter_audit_event_check
  CHECK (event IN ('draft', 'block_rewrite', 'cross_review', 'review_reject', 'review_pass', 'title_edit'));

-- 검증 (기대: 한 줄 · title_edit 이 들어 있음)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.ds_letter_audit'::regclass AND conname = 'ds_letter_audit_event_check';
