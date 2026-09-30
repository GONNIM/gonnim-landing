-- ===========================================================================
-- 지배상식 · 확인된 뜻 (D44 · 22차 A-2)                          2026-09-30 작성
-- ===========================================================================
--
-- 실행 위치: sprint-dominance 프로젝트의 Supabase SQL Editor (D22 · 런북 12번).
-- Claude Code 는 이 파일을 실행하지 않는다. 운영자가 한 번 실행한다. 다시 실행해도 안전하다.
--
-- 사실 문장의 한국어 뜻은 증거 단계에서 만들고 사람이 확인한다. 초안은 확인된 뜻만 받는다(D44).
-- 이 SQL 전에는 앱이 뜻을 note 끝 "⟦meta⟧{"facts":[{"ko":…,"ko_verified_at":…}]}" 에 임시로 둔다.
--
-- 순서
--   1. ds_question_evidence 새 칸 2개: fact_ko · fact_ko_verified_at
--   2. 메타 줄의 뜻을 새 칸으로 옮기고 메타 줄을 지운다 (한 줄 행만)
--   3. 검증
-- ===========================================================================

-- 1. 새 칸
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS fact_ko TEXT;               -- 한국어 뜻 한 줄
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS fact_ko_verified_at TIMESTAMPTZ; -- 사람이 [확인]을 누른 시각

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

-- 2. 메타 줄 옮기기 · 한 줄 행만. 칸에 값이 있으면 칸 값을 둔다.
UPDATE public.ds_question_evidence e
SET fact_ko             = COALESCE(e.fact_ko, NULLIF(m.f ->> 'ko', '')),
    fact_ko_verified_at = COALESCE(e.fact_ko_verified_at,
                                   CASE WHEN NULLIF(m.f ->> 'ko', '') IS NOT NULL
                                        THEN (m.f ->> 'ko_verified_at')::TIMESTAMPTZ END),
    note                = NULLIF(btrim(m.memo, E' \n'), '')
FROM (
  SELECT id,
         split_part(note, '⟦meta⟧', 1)                          AS memo,
         (split_part(note, '⟦meta⟧', 2)::jsonb -> 'facts') -> 0  AS f
  FROM public.ds_question_evidence
  WHERE note LIKE '%⟦meta⟧{%'
    AND fact_sentence IS NOT NULL
    AND position(E'\n' IN fact_sentence) = 0
) m
WHERE e.id = m.id;

-- 3. 검증
-- 3-1. 새 칸 2개 (기대: 2줄)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ds_question_evidence'
  AND column_name IN ('fact_ko', 'fact_ko_verified_at')
ORDER BY column_name;

-- 3-2. 남은 메타 줄 (기대: 0)
SELECT count(*) AS meta_left
FROM public.ds_question_evidence
WHERE note LIKE '%⟦meta⟧%' AND fact_sentence IS NOT NULL AND position(E'\n' IN fact_sentence) = 0;

-- 3-3. 뜻이 있는 문장 · 확인된 문장 (기대: 뜻 있음 = 문장 수에 가까움, 확인됨 = 운영자가 누른 수)
SELECT count(*) FILTER (WHERE fact_sentence IS NOT NULL) AS sentences,
       count(fact_ko)                                   AS with_ko,
       count(fact_ko_verified_at)                       AS verified
FROM public.ds_question_evidence;

-- 3-4. 일부러 실패해야 하는 UPDATE · 뜻 없이 확인 시각만 (기대: NOTICE "OK")
DO $$
DECLARE
  rid UUID;
BEGIN
  SELECT id INTO rid FROM public.ds_question_evidence WHERE fact_ko IS NULL LIMIT 1;
  IF rid IS NULL THEN
    RAISE NOTICE '3-4 건너뜀 — 뜻이 빈 행이 없다';
    RETURN;
  END IF;
  BEGIN
    UPDATE public.ds_question_evidence SET fact_ko_verified_at = NOW() WHERE id = rid;
    RAISE EXCEPTION '실패해야 할 UPDATE 가 통과했다 (ko_verified_needs_ko 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 뜻 없는 확인이 막혔다';
  END;
END $$;

-- 되돌리기 (필요할 때만)
-- ALTER TABLE public.ds_question_evidence DROP CONSTRAINT IF EXISTS ds_question_evidence_ko_verified_needs_ko;
-- ALTER TABLE public.ds_question_evidence DROP COLUMN IF EXISTS fact_ko_verified_at, DROP COLUMN IF EXISTS fact_ko;
