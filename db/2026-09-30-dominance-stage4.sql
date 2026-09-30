-- ===========================================================================
-- 지배상식 · 4단계 스키마 (18차 통합 C-7 · B-3 · 19차 A-2 · C-1)  2026-09-29 작성 · 09-30 보강
-- ===========================================================================
--
-- 실행 위치: sprint-dominance 프로젝트의 Supabase SQL Editor (D22 · 런북 10번).
-- Claude Code 는 이 파일을 실행하지 않는다. 운영자가 한 번 실행한다.
-- 모든 문장은 다시 실행해도 안전하다 (IF NOT EXISTS · 존재 확인 DO 블록).
--
-- 순서
--   1. ds_questions.seed_kind 에 'trend' 추가 (B-3 승인)
--   2. ds_questions 새 칸 6개: area · created_via · source_input · v2_reasons · suggested · evidence_run
--   3. 메모(work_note) 끝의 임시 메타 줄을 새 칸으로 옮긴다
--   3a. ds_question_evidence 새 칸 5개 (사실 문장 한 줄마다): fact_subject · fact_year · has_number ·
--       verified_at · source_part  + 같은 칸 · 같은 원천에 문장 여러 행을 허용하는 유일 인덱스
--   3b. 증거 note 끝의 임시 메타 줄(문장 한 줄짜리 행)을 새 칸으로 옮긴다
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
-- [빈 칸 채우기] 제안. 운영자가 저장하기 전까지 화면에 "제안" 으로 보인다(19차 B-1)
ALTER TABLE public.ds_questions ADD COLUMN IF NOT EXISTS suggested JSONB;
-- [증거 모으기] 결과 요약: 칸별 원천 · 문장 수, 대조 실패 수, 시간, 산업 검색 링크 (19차 C-3 ⑧)
ALTER TABLE public.ds_questions ADD COLUMN IF NOT EXISTS evidence_run JSONB;

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
    suggested    = COALESCE(q.suggested, m.meta -> 'suggested'),
    evidence_run = COALESCE(q.evidence_run, m.meta -> 'evidence_run'),
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
-- 3a. ds_question_evidence · 사실 문장 한 줄의 속성 (19차 C-1)
-- ===========================================================================
-- SQL 뒤에는 새 문장을 한 행에 하나씩 넣는다. SQL 전에 한 행에 여러 줄로 묶어 둔 문장은
-- 그대로 두고, 앱이 note 끝 메타 줄에서 속성을 읽는다(행 안에서만 고친다).
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS fact_subject TEXT;      -- 대상 (예: 영국 성인 72,174명)
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS fact_year SMALLINT;     -- 연도
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS has_number BOOLEAN;     -- 수치 유무
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ; -- 원문 글자 대조 시각
ALTER TABLE public.ds_question_evidence ADD COLUMN IF NOT EXISTS source_part TEXT;       -- 뽑은 곳

-- ★ D43 본문 예외: source_part = 'body' 는 CC BY · CC0 · 퍼블릭 도메인 논문에서만, 원천당 2문장까지.
--   행 사이를 세야 하는 규칙이라 CHECK 로 걸 수 없다. 앱(evidence.ts verifySentence · BODY_LIMIT)이 지킨다.
--   레터가 원문을 40자 이상 그대로 옮기지 않는 규칙은 3단계 글 점검이 지킨다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.ds_question_evidence'::regclass
                   AND conname = 'ds_question_evidence_source_part') THEN
    ALTER TABLE public.ds_question_evidence ADD CONSTRAINT ds_question_evidence_source_part
      CHECK (source_part IS NULL OR source_part IN ('abstract', 'body', 'memo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.ds_question_evidence'::regclass
                   AND conname = 'ds_question_evidence_fact_year') THEN
    ALTER TABLE public.ds_question_evidence ADD CONSTRAINT ds_question_evidence_fact_year
      CHECK (fact_year IS NULL OR fact_year BETWEEN 1800 AND 2100);
  END IF;
END $$;

-- 옛 유일 인덱스는 같은 칸 · 같은 원천에 행을 하나만 허용했다. 이제 문장이 다르면 행을 여럿 둔다.
-- 같은 칸 · 같은 원천 · 같은 문장은 여전히 한 번만 (문장 없는 원천 자리도 한 번만).
DROP INDEX IF EXISTS public.uq_ds_question_evidence_paper;
DROP INDEX IF EXISTS public.uq_ds_question_evidence_press;
DROP INDEX IF EXISTS public.uq_ds_question_evidence_ext;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ds_question_evidence_paper_fact
  ON public.ds_question_evidence (question_id, slot, paper_id, md5(COALESCE(fact_sentence, '')))
  WHERE paper_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ds_question_evidence_press_fact
  ON public.ds_question_evidence (question_id, slot, gov_press_id, md5(COALESCE(fact_sentence, '')))
  WHERE gov_press_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ds_question_evidence_ext_fact
  ON public.ds_question_evidence (question_id, slot, ext_url, md5(COALESCE(fact_sentence, '')))
  WHERE ext_url IS NOT NULL;


-- ===========================================================================
-- 3b. 증거 메타 줄 옮기기 (문장 한 줄짜리 행만)
-- ===========================================================================
-- note 끝 "⟦meta⟧{"facts":[{…}]}" 의 첫 원소를 새 칸으로 옮기고 메타 줄을 지운다.
-- 여러 줄로 묶인 행은 건드리지 않는다(앱이 메타 줄을 계속 읽는다).
UPDATE public.ds_question_evidence e
SET fact_subject = COALESCE(e.fact_subject, m.f ->> 'subject'),
    fact_year    = COALESCE(e.fact_year, (m.f ->> 'year')::SMALLINT),
    has_number   = COALESCE(e.has_number, (m.f ->> 'has_number')::BOOLEAN),
    verified_at  = COALESCE(e.verified_at, (m.f ->> 'verified_at')::TIMESTAMPTZ),
    source_part  = COALESCE(e.source_part, m.f ->> 'source_part'),
    note         = NULLIF(btrim(m.memo, E' \n'), '')
FROM (
  SELECT id,
         split_part(note, '⟦meta⟧', 1)                              AS memo,
         (split_part(note, '⟦meta⟧', 2)::jsonb -> 'facts') -> 0      AS f
  FROM public.ds_question_evidence
  WHERE note LIKE '%⟦meta⟧{%'
    AND fact_sentence IS NOT NULL
    AND position(E'\n' IN fact_sentence) = 0
) m
WHERE e.id = m.id;


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

-- 7-1. 새 칸 (기대: 질문 6줄 + 증거 5줄 = 11줄)
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'ds_questions'
        AND column_name IN ('area', 'created_via', 'source_input', 'v2_reasons', 'suggested', 'evidence_run'))
    OR (table_name = 'ds_question_evidence'
        AND column_name IN ('fact_subject', 'fact_year', 'has_number', 'verified_at', 'source_part')))
ORDER BY table_name, column_name;

-- 7-1b. 새 유일 인덱스 3개 (기대: 3줄) · 옛 인덱스 (기대: 0줄)
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'ds_question_evidence' AND indexname LIKE 'uq_ds_question_evidence_%'
ORDER BY indexname;

-- 7-2. 새 표 2개 (기대: 2줄)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('ds_letter_reactions', 'ds_reaction_dedupe')
ORDER BY table_name;

-- 7-3. 메타 줄이 남지 않았는가 (기대: 0 · 0)
SELECT count(*) AS meta_left FROM public.ds_questions WHERE work_note LIKE '%⟦meta⟧%';
SELECT count(*) AS evidence_meta_left_single
FROM public.ds_question_evidence
WHERE note LIKE '%⟦meta⟧%' AND fact_sentence IS NOT NULL AND position(E'\n' IN fact_sentence) = 0;

-- 7-4. 영역이 옮겨졌는가 (기대: 질문 수와 비슷한 숫자 · 0 이면 알려 주십시오)
SELECT count(*) AS with_area FROM public.ds_questions WHERE area IS NOT NULL;

-- 7-5. 일부러 실패해야 하는 INSERT 여러 개(① ~ ⑧). 막히면 NOTICE "OK", 통과하면 블록 전체가 되돌려진다.
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

  -- ⑥ 증거의 뽑은 곳이 허용 밖
  BEGIN
    INSERT INTO public.ds_question_evidence (question_id, ext_url, ext_title, ext_source_kind, license, slot, added_by, source_part)
    VALUES (qid, 'https://example.org/6', '시험', 'news', 'link_only', 'industry', 'owner', 'full_text');
    RAISE EXCEPTION '실패해야 할 INSERT ⑥ 이 통과했다 (source_part CHECK 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK ⑥ 허용 밖 source_part 가 막혔다';
  END;

  -- ⑦ 같은 칸 · 같은 원천이라도 문장이 다르면 두 행이 들어간다(새 유일 인덱스)
  INSERT INTO public.ds_question_evidence (question_id, ext_url, ext_title, ext_source_kind, license, slot, added_by, fact_sentence)
  VALUES (qid, 'https://example.org/7', '시험', 'agency', 'public_domain', 'industry', 'owner', '첫 문장'),
         (qid, 'https://example.org/7', '시험', 'agency', 'public_domain', 'industry', 'owner', '둘째 문장');
  RAISE NOTICE 'OK ⑦ 같은 원천의 다른 문장 두 행이 들어갔다';

  -- ⑧ 같은 문장은 두 번 들어가지 않는다
  BEGIN
    INSERT INTO public.ds_question_evidence (question_id, ext_url, ext_title, ext_source_kind, license, slot, added_by, fact_sentence)
    VALUES (qid, 'https://example.org/7', '시험', 'agency', 'public_domain', 'industry', 'owner', '첫 문장');
    RAISE EXCEPTION '실패해야 할 INSERT ⑧ 이 통과했다 (문장 유일 인덱스 없음)';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK ⑧ 같은 문장 중복이 막혔다';
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
-- ALTER TABLE public.ds_question_evidence DROP COLUMN IF EXISTS source_part, DROP COLUMN IF EXISTS verified_at,
--   DROP COLUMN IF EXISTS has_number, DROP COLUMN IF EXISTS fact_year, DROP COLUMN IF EXISTS fact_subject;
--   (문장 여러 행이 생긴 뒤에는 옛 유일 인덱스를 다시 만들 수 없다. 되돌리기 전에 알려 주십시오.)
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS evidence_run, DROP COLUMN IF EXISTS suggested;
-- DROP TABLE IF EXISTS public.ds_reaction_dedupe;
-- DROP TABLE IF EXISTS public.ds_letter_reactions;
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS v2_reasons;
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS source_input;
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS created_via;
-- ALTER TABLE public.ds_questions DROP COLUMN IF EXISTS area;
-- 되돌린 뒤에는 콘솔이 다시 메모 칸 끝에 임시로 적는다. 이미 옮긴 값은 되돌아오지 않는다.
