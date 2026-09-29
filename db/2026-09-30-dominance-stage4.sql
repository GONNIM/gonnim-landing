-- ===========================================================================
-- 지배상식 · 4단계 스키마 (18차 통합 C-7 · B-3)                   2026-09-29 작성
-- ===========================================================================
--
-- 실행 위치: sprint-dominance 프로젝트의 Supabase SQL Editor (D22 · 런북 10번).
-- Claude Code 는 이 파일을 실행하지 않는다. 운영자가 한 번 실행한다.
-- 모든 문장은 다시 실행해도 안전하다 (IF NOT EXISTS · 존재 확인 DO 블록).
--
-- 순서
--   1. ds_questions.seed_kind 에 'trend' 추가 (B-3 승인)
--   2. ds_questions 새 칸 4개: area · created_via · source_input · v2_reasons
--   3. 메모(work_note) 끝의 임시 메타 줄을 새 칸으로 옮긴다
--   4. ds_letter_reactions  · 레터별 반응 집계 (D42 4층)
--   5. ds_reaction_dedupe   · 같은 사람의 중복 반응만 막는 해시 (개인 식별 없음)
--   6. RLS                  · 켜기만 하고 정책은 만들지 않는다 (D22)
--   7. 검증 쿼리 · 일부러 실패해야 하는 INSERT
-- ===========================================================================


-- ===========================================================================
-- 1. seed_kind 에 trend 추가 · S5 트렌드 갈래 (D41)
-- ===========================================================================
DO $$
DECLARE
  cname TEXT;
BEGIN
  -- 이름이 자동으로 붙은 옛 CHECK 를 찾는다. trend 가 이미 들어 있으면 건드리지 않는다.
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.ds_questions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%seed_kind%'
    AND pg_get_constraintdef(oid) NOT LIKE '%trend%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ds_questions DROP CONSTRAINT %I', cname);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.ds_questions'::regclass
                   AND conname = 'ds_questions_seed_kind_check5') THEN
    ALTER TABLE public.ds_questions ADD CONSTRAINT ds_questions_seed_kind_check5
      CHECK (seed_kind IN ('editorial', 'hypothesis', 'review_title', 'owner', 'trend'));
  END IF;
END $$;


-- ===========================================================================
-- 2. ds_questions 새 칸
-- ===========================================================================
-- 관심 영역 지도 10개 중 하나 (D41). 영역은 분기마다 바뀔 수 있어 CHECK 를 두지 않는다.
ALTER TABLE public.ds_questions ADD COLUMN IF NOT EXISTS area TEXT;
-- [이슈 만들기] 입력 방식. llm = ⓪-1 제안이 만든 것
ALTER TABLE public.ds_questions ADD COLUMN IF NOT EXISTS created_via TEXT;
-- 운영자가 넣은 원래 입력. 링크는 주소와 페이지 제목만 둔다(본문 없음)
ALTER TABLE public.ds_questions ADD COLUMN IF NOT EXISTS source_input TEXT;
-- V2 판정 근거. 상위 5편마다 {id, title, year, license, relevant, reason} (D31)
ALTER TABLE public.ds_questions ADD COLUMN IF NOT EXISTS v2_reasons JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.ds_questions'::regclass
                   AND conname = 'ds_questions_created_via') THEN
    ALTER TABLE public.ds_questions ADD CONSTRAINT ds_questions_created_via
      CHECK (created_via IS NULL OR created_via IN ('sentence', 'topic', 'link', 'llm'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ds_questions_area
  ON public.ds_questions (area) WHERE area IS NOT NULL;


-- ===========================================================================
-- 3. 임시 메타 줄 옮기기
-- ===========================================================================
-- SQL 실행 전 콘솔은 새 칸 값을 work_note 끝에 "⟦meta⟧{json}" 한 줄로 적었다.
-- 그 값을 칸으로 옮기고, 메모에서는 그 줄을 지운다. 칸에 이미 값이 있으면 칸 값을 둔다.
UPDATE public.ds_questions q
SET area         = COALESCE(q.area, m.meta ->> 'area'),
    created_via  = COALESCE(q.created_via, m.meta ->> 'created_via'),
    source_input = COALESCE(q.source_input, m.meta ->> 'source_input'),
    v2_reasons   = COALESCE(q.v2_reasons, m.meta -> 'v2_reasons'),
    work_note    = NULLIF(btrim(m.memo, E' \n'), '')
FROM (
  SELECT id,
         split_part(work_note, '⟦meta⟧', 1)          AS memo,
         split_part(work_note, '⟦meta⟧', 2)::jsonb   AS meta
  FROM public.ds_questions
  WHERE work_note LIKE '%⟦meta⟧{%'
) m
WHERE q.id = m.id;


-- ===========================================================================
-- 4. ds_letter_reactions · 레터별 반응 집계 (D42)
-- ===========================================================================
-- ★ 개인을 저장하지 않는다. 레터 한 편에 한 행, 숫자만 둔다.
--   ① 열람 · 클릭 (Resend 웹훅)  ② 끝 도달  ③ 반응 3개  ④ 다음 질문 투표 · 답장 수
CREATE TABLE IF NOT EXISTS public.ds_letter_reactions (
  letter_id UUID PRIMARY KEY REFERENCES public.ds_letters(id) ON DELETE CASCADE,

  opens INT NOT NULL DEFAULT 0 CHECK (opens >= 0),
  clicks INT NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  end_reached INT NOT NULL DEFAULT 0 CHECK (end_reached >= 0),

  react_new INT NOT NULL DEFAULT 0 CHECK (react_new >= 0),            -- 몰랐다
  react_known INT NOT NULL DEFAULT 0 CHECK (react_known >= 0),        -- 알고 있었다
  react_more INT NOT NULL DEFAULT 0 CHECK (react_more >= 0),          -- 더 알고 싶다

  -- 다음 질문 후보 3개 투표. {"<question_id>": 12, …}
  next_votes JSONB NOT NULL DEFAULT '{}'::jsonb,
  replies INT NOT NULL DEFAULT 0 CHECK (replies >= 0),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ds_letter_reactions IS
  '독자 반응 4층 (D42) · 레터별 집계만 · 개인 식별 정보 없음';


-- ===========================================================================
-- 5. ds_reaction_dedupe · 중복 막기 해시만
-- ===========================================================================
-- 같은 사람이 같은 레터에 같은 종류로 두 번 누른 것만 막는다.
-- hash = HMAC(비밀값, 구독자 토큰 + 레터 + 종류). 구독자 ID · 이메일은 저장하지 않는다.
-- 비밀값이 서버 밖에 없으므로 해시에서 사람을 되찾을 수 없다.
CREATE TABLE IF NOT EXISTS public.ds_reaction_dedupe (
  letter_id UUID NOT NULL REFERENCES public.ds_letters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('open', 'click', 'end', 'react', 'vote')),
  hash TEXT NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (letter_id, kind, hash)
);

COMMENT ON TABLE public.ds_reaction_dedupe IS
  '중복 반응 막기 · HMAC 해시만 저장 · 개인 식별 정보 없음 (D42)';


-- ===========================================================================
-- 6. RLS · 켜기만 한다. 정책은 0개 (D22)
-- ===========================================================================
ALTER TABLE public.ds_letter_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_reaction_dedupe ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- 7. 검증
-- ===========================================================================

-- 7-1. 새 칸 4개 (기대: 4줄)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ds_questions'
  AND column_name IN ('area', 'created_via', 'source_input', 'v2_reasons')
ORDER BY column_name;

-- 7-2. 새 표 2개 (기대: 2줄)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('ds_letter_reactions', 'ds_reaction_dedupe')
ORDER BY table_name;

-- 7-3. 메타 줄이 남지 않았는가 (기대: 0)
SELECT count(*) AS meta_left FROM public.ds_questions WHERE work_note LIKE '%⟦meta⟧%';

-- 7-4. 영역이 옮겨졌는가 (기대: 질문 수와 비슷한 숫자 · 0 이면 알려 주십시오)
SELECT count(*) AS with_area FROM public.ds_questions WHERE area IS NOT NULL;

-- 7-5. 일부러 실패해야 하는 INSERT 4개. 막히면 NOTICE "OK", 통과하면 블록 전체가 되돌려진다.
DO $$
DECLARE
  qid UUID;
BEGIN
  -- ① trend 는 이제 들어간다
  INSERT INTO public.ds_questions (question, seed_kind)
  VALUES ('[시험] 지워질 질문', 'trend')
  RETURNING id INTO qid;
  RAISE NOTICE 'OK ① trend 갈래가 들어갔다';

  -- ② 허용 밖 갈래
  BEGIN
    INSERT INTO public.ds_questions (question, seed_kind) VALUES ('[시험] 지워질 질문 2', 'rumor');
    RAISE EXCEPTION '실패해야 할 INSERT ② 가 통과했다 (seed_kind CHECK 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK ② 허용 밖 갈래가 막혔다';
  END;

  -- ③ 허용 밖 입력 방식
  BEGIN
    UPDATE public.ds_questions SET created_via = 'email' WHERE id = qid;
    RAISE EXCEPTION '실패해야 할 UPDATE ③ 이 통과했다 (created_via CHECK 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK ③ 허용 밖 입력 방식이 막혔다';
  END;

  -- ④ 해시가 아닌 값(예: 이메일)은 중복 막기 표에 들어가지 않는다
  BEGIN
    INSERT INTO public.ds_reaction_dedupe (letter_id, kind, hash)
    VALUES ((SELECT id FROM public.ds_letters LIMIT 1), 'react', 'reader@example.com');
    RAISE EXCEPTION '실패해야 할 INSERT ④ 가 통과했다 (hash CHECK 없음)';
  EXCEPTION
    WHEN check_violation THEN RAISE NOTICE 'OK ④ 해시가 아닌 값이 막혔다';
    WHEN not_null_violation THEN RAISE NOTICE '④ 건너뜀 — ds_letters 가 비어 있다';
  END;

  -- ⑤ 음수 집계
  BEGIN
    INSERT INTO public.ds_letter_reactions (letter_id, opens)
    VALUES ((SELECT id FROM public.ds_letters LIMIT 1), -1);
    RAISE EXCEPTION '실패해야 할 INSERT ⑤ 가 통과했다 (opens CHECK 없음)';
  EXCEPTION
    WHEN check_violation THEN RAISE NOTICE 'OK ⑤ 음수 집계가 막혔다';
    WHEN not_null_violation THEN RAISE NOTICE '⑤ 건너뜀 — ds_letters 가 비어 있다';
  END;

  DELETE FROM public.ds_questions WHERE id = qid;
END $$;

-- 7-6. 시험 행이 남지 않았는가 (기대: 0)
SELECT count(*) AS leftover_test_rows FROM public.ds_questions WHERE question LIKE '[시험]%';


-- ===========================================================================
-- 되돌리기 (필요할 때만 · 주석 해제 후 실행)
-- ===========================================================================
-- DROP TABLE IF EXISTS public.ds_reaction_dedupe;
-- DROP TABLE IF EXISTS public.ds_letter_reactions;
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS v2_reasons;
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS source_input;
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS created_via;
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS area;
-- 되돌린 뒤에는 콘솔이 다시 메모 칸 끝에 임시로 적는다. 이미 옮긴 값은 되돌아오지 않는다.
