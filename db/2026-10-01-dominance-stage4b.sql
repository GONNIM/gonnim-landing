-- ===========================================================================
-- 지배상식 · 4단계 보충 통합본 (27차 B)                              2026-10-01 작성
-- ===========================================================================
--
-- 실행 위치: sprint-dominance 프로젝트의 Supabase SQL Editor (D22 · 런북 16번).
-- Claude Code 는 이 파일을 실행하지 않는다. 운영자가 한 번 실행한다. 다시 실행해도 안전하다.
--
-- 이 파일 하나가 아래 두 파일을 대신한다. 두 파일은 실행하지 않는다.
--   - db/2026-10-01-dominance-fact-ko.sql     (런북 12 · 확인된 뜻 칸 · D44)
--   - db/2026-10-01-dominance-click-kinds.sql (런북 15 · 클릭 종류 칸 · 26차 C-1)
--
-- 순서
--   1. ds_question_evidence 새 칸 2개: fact_ko · fact_ko_verified_at (+ 제약 1개)
--   2. 메타 줄의 뜻을 새 칸으로 옮긴다 (한 줄 행만). 주변 표시(rel)는 메타 줄에 남긴다.
--   3. ds_letter_reactions 새 칸 1개: click_kinds
--   4. 검증 · RLS 확인
-- ===========================================================================

-- 1. 확인된 뜻 칸 (D44)
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS fact_ko TEXT;                    -- 한국어 뜻 한 줄
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS fact_ko_verified_at TIMESTAMPTZ;  -- 사람이 [확인]을 누른 시각

DO $$
BEGIN
  -- 확인 시각은 뜻이 있을 때만 찍힌다.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.ds_question_evidence'::regclass
                   AND conname = 'ds_question_evidence_ko_verified_needs_ko') THEN
    ALTER TABLE public.ds_question_evidence ADD CONSTRAINT ds_question_evidence_ko_verified_needs_ko
      CHECK (fact_ko_verified_at IS NULL OR fact_ko IS NOT NULL);
  END IF;
END $$;

-- 2. 메타 줄 옮기기 · 한 줄 행만 · 칸에 값이 있으면 칸 값을 둔다.
--    메타 줄에 주변 표시({"rel":1} · 26차 A-3)가 있으면 그것만 남긴다. 없으면 메타 줄을 지운다.
--    두 번째 실행에서는 뜻이 든 메타 줄이 없으므로 아무 행도 바뀌지 않는다.
UPDATE public.ds_question_evidence e
SET fact_ko             = COALESCE(e.fact_ko, NULLIF(m.f ->> 'ko', '')),
    fact_ko_verified_at = COALESCE(e.fact_ko_verified_at,
                                   CASE WHEN NULLIF(m.f ->> 'ko', '') IS NOT NULL
                                        THEN (m.f ->> 'ko_verified_at')::TIMESTAMPTZ END),
    note                = NULLIF(concat_ws(E'\n',
                                   NULLIF(btrim(m.memo, E' \n'), ''),
                                   CASE WHEN m.f ->> 'rel' = '1' THEN '⟦meta⟧{"facts":[{"rel":1}]}' END), '')
FROM (
  SELECT id,
         split_part(note, '⟦meta⟧', 1)                          AS memo,
         (split_part(note, '⟦meta⟧', 2)::jsonb -> 'facts') -> 0  AS f
  FROM public.ds_question_evidence
  WHERE note LIKE '%⟦meta⟧{%'
    AND fact_sentence IS NOT NULL
    AND position(E'\n' IN fact_sentence) = 0
) m
WHERE e.id = m.id
  AND m.f ? 'ko';

-- 3. 클릭 종류 칸 (26차 C-1)
-- {"source": 3, "web": 1, "unsubscribe": 0, "react": 2, "vote": 1, "other": 0} · 개인 정보 없음.
-- 이 SQL 전에는 앱이 next_votes 의 "_clicks" 키에 임시로 센다. 반응 화면은 둘을 더해 보여 준다.
ALTER TABLE public.ds_letter_reactions
  ADD COLUMN IF NOT EXISTS click_kinds JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ds_letter_reactions.click_kinds IS
  '링크 종류별 클릭 수(원천 · 웹에서 보기 · 수신거부 · 반응 · 투표 · 기타) · 레터별 집계만 (26차)';

-- 4. 검증
-- 4-1. 새 칸 3개 (기대: 3줄 · click_kinds jsonb · fact_ko text · fact_ko_verified_at timestamp with time zone)
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'ds_question_evidence' AND column_name IN ('fact_ko', 'fact_ko_verified_at'))
    OR (table_name = 'ds_letter_reactions' AND column_name = 'click_kinds'))
ORDER BY table_name, column_name;

-- 4-2. 뜻이 남은 메타 줄 (기대: 0)
SELECT count(*) AS ko_meta_left
FROM public.ds_question_evidence
WHERE note LIKE '%⟦meta⟧%"ko"%' AND fact_sentence IS NOT NULL AND position(E'\n' IN fact_sentence) = 0;

-- 4-3. 뜻이 있는 문장 · 확인된 문장 (기대: 뜻 있음 = 문장 수에 가까움 · 확인됨 = 운영자가 누른 수)
SELECT count(*) FILTER (WHERE fact_sentence IS NOT NULL) AS sentences,
       count(fact_ko)                                   AS with_ko,
       count(fact_ko_verified_at)                       AS verified
FROM public.ds_question_evidence;

-- 4-4. 일부러 실패해야 하는 UPDATE · 뜻 없이 확인 시각만 (기대: NOTICE "OK 뜻 없는 확인이 막혔다")
DO $$
DECLARE
  rid UUID;
BEGIN
  SELECT id INTO rid FROM public.ds_question_evidence WHERE fact_ko IS NULL LIMIT 1;
  IF rid IS NULL THEN
    RAISE NOTICE '4-4 건너뜀 — 뜻이 빈 행이 없다';
    RETURN;
  END IF;
  BEGIN
    UPDATE public.ds_question_evidence SET fact_ko_verified_at = NOW() WHERE id = rid;
    RAISE EXCEPTION '실패해야 할 UPDATE 가 통과했다 (ko_verified_needs_ko 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 뜻 없는 확인이 막혔다';
  END;
END $$;

-- 4-5. RLS (기대: 두 줄 모두 relrowsecurity = true)
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('ds_letter_reactions', 'ds_reaction_dedupe')
ORDER BY relname;

-- 되돌리기 (필요할 때만)
-- ALTER TABLE public.ds_letter_reactions DROP COLUMN IF EXISTS click_kinds;
-- ALTER TABLE public.ds_question_evidence DROP CONSTRAINT IF EXISTS ds_question_evidence_ko_verified_needs_ko;
-- ALTER TABLE public.ds_question_evidence DROP COLUMN IF EXISTS fact_ko_verified_at, DROP COLUMN IF EXISTS fact_ko;
