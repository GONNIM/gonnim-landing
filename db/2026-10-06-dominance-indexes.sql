-- ===========================================================================
-- 지배상식 · 화면 읽기 색인 (56차 D)                                          2026-10-06
-- ===========================================================================
-- 실행 전 확인(10/6): status · question_id 색인은 이미 있다
--   ds_questions(status, created_at DESC) · ds_letters(status) · ds_letters(question_id) · ds_question_evidence(question_id, slot).
-- 여기서는 화면이 실제로 쓰는 정렬까지 덮는 색인 두 개만 더한다. 표가 작아(수십 행) 효과는 작다.
--   ds_letters: 질문의 가장 최근 글(question_id = ? ORDER BY created_at DESC LIMIT 1) · ② 증거 표 · 뜻 채움 · 재기 라우트
--   ds_question_evidence: 질문의 증거 줄(question_id = ? ORDER BY created_at) · 증거 표 · 카드
-- ds_question_evidence 에는 letter_id 칸이 없다(색인 후보에서 뺌).
-- 다시 실행해도 안전하다. 실행: Claude Code 가 SUPABASE_ACCESS_TOKEN 으로(scripts/dominance-sql.ts).

CREATE INDEX IF NOT EXISTS idx_ds_letters_question_created
  ON public.ds_letters (question_id, created_at DESC) WHERE question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ds_question_evidence_question_created
  ON public.ds_question_evidence (question_id, created_at);

-- 검증 (기대: 두 줄)
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname IN ('idx_ds_letters_question_created', 'idx_ds_question_evidence_question_created')
ORDER BY indexname;
