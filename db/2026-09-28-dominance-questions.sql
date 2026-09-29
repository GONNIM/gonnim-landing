-- ===========================================================================
-- 지배상식 · 질문 단위 전환 (D24 확정 · D29 · D33)       2026-09-28 초안 (보충 2판 반영)
-- ===========================================================================
--
-- ★ 2026-09-28 프로덕션 실행 완료 (sprint-dominance · 운영자 실행 · 11차 검증 통과).
--   다시 실행해도 안전하다. 새 환경을 만들 때의 기준 파일이다.
--
-- 실행 위치: sprint-dominance 프로젝트의 Supabase SQL Editor (D22).
-- Claude Code 는 이 파일을 실행할 수 없다. 저장소에 있는 것은 supabase-js 뿐이고
-- 그것은 PostgREST 를 타므로 행 단위 조회·삽입만 된다. 스키마 변경문은 보낼 경로가 없다.
--
-- 모든 문장은 다시 실행해도 안전하다 (IF NOT EXISTS · OR REPLACE · 존재 확인 DO 블록).
-- 기존 행은 고치지 않는다. ds_candidates 는 그대로 두고 새로 쓰지 않는다.
--
-- 순서
--   1. ds_questions          · 질문 (검증 값 V1~V6 포함)
--   2. ds_question_evidence  · 질문별 증거 (재료 네 칸)
--   3. ds_letters.question_id
--   4. ds_letter_sources     · 외부 1차 공시 허용
--   5. RLS                   · 켜기만 하고 정책은 만들지 않는다 (D22)
--   6. 검증 쿼리 · 일부러 실패해야 하는 INSERT 3개
-- ===========================================================================


-- ===========================================================================
-- 1. ds_questions · 질문이 선정 단위다 (D24)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 질문 문장. 작품명을 넣지 않는다 (D32).
  question TEXT NOT NULL,
  -- 독자가 이미 믿는 통설
  premise TEXT,
  -- 그 통설을 되묻는 지점
  twist TEXT,
  -- 계열 한 단어 (노화 · 수면 · 식사 · 감염 …)
  series TEXT,
  -- Europe PMC 검색어. 검증과 증거 수집이 같은 검색어를 쓴다 (D26).
  search_queries TEXT[] NOT NULL DEFAULT '{}',

  -- 출처 네 갈래 (D25). 어느 갈래든 같은 검증을 거친다.
  seed_kind TEXT NOT NULL
    CHECK (seed_kind IN ('editorial', 'hypothesis', 'review_title', 'owner')),
  -- 작품명 메모. 선택. 화면·스토어 자료에 쓰지 않는다 (D32).
  work_note TEXT,

  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'validated', 'rejected', 'held',
                      'adopted', 'drafted', 'published')),

  -- 검증 값 (D31). 기준 숫자는 실측 뒤 확정하므로 값만 남긴다.
  v1_papers_5y INT,                 -- 최근 5년 논문 수
  v1_reviews INT,                   -- 그중 리뷰 수
  v2_relevant_of_5 SMALLINT         -- 상위 5편 중 질문과 관련 있는 편수
    CHECK (v2_relevant_of_5 BETWEEN 0 AND 5),
  v3_evidence_ok BOOLEAN,           -- 라이선스 통과 논문이 있는가
  v4_by_year JSONB,                 -- {"2016": 12, …, "2026": 80}
  v4_ratio NUMERIC(6, 2),           -- 최근 3년 합 ÷ 그 전 3년 합
  -- 원칙 4: 언어는 조건이 아니다. 한국어 보도 여부는 어디에도 남기지 않는다.
  v5_wiki_en_30d INT,               -- 영어 위키백과 30일 조회수 (문서 없음 = NULL)
  v5_wiki_ko_30d INT,               -- 한국어 위키백과 30일 조회수 (문서 없음 = NULL)
  v6_medlineplus_topics INT,        -- MedlinePlus 건강 주제 검색 결과 수 (D31 · 6차)
  checked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  adopted_at TIMESTAMPTZ,

  -- ★ 넘지 않는 선 7 · 8. 채택 이후 상태는 검증 기록과 채택 시각이 있어야 한다.
  --   통과 기준 숫자는 아직 없으므로 "재 보았고 V3 가 참" 까지만 DB 가 막는다.
  CONSTRAINT ds_questions_adopted_needs_validation
    CHECK (
      status NOT IN ('adopted', 'drafted', 'published')
      OR (checked_at IS NOT NULL
          AND v1_papers_5y IS NOT NULL
          AND v2_relevant_of_5 IS NOT NULL
          AND v3_evidence_ok IS TRUE
          AND adopted_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_ds_questions_status
  ON public.ds_questions (status, created_at DESC);

COMMENT ON TABLE public.ds_questions IS
  '질문 = 선정 단위 (D24) · 검증을 통과하지 않은 질문은 채택 목록에 오르지 않는다 · 채택은 사람이 한다';


-- ===========================================================================
-- 2. ds_question_evidence · 질문별 증거, 재료 네 칸 (D26 · D28)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_question_evidence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  question_id UUID NOT NULL REFERENCES public.ds_questions(id) ON DELETE CASCADE,

  -- 원천은 셋 중 하나다. 적재된 논문 · 적재된 보도자료 · 외부 1차 공시.
  paper_id UUID REFERENCES public.ds_papers(id) ON DELETE RESTRICT,
  gov_press_id UUID REFERENCES public.ds_gov_press(id) ON DELETE RESTRICT,

  -- 외부 원천은 본문을 저장하지 않는다. 링크 · 제목 · 출처 종류 · 이용 조건만.
  ext_url TEXT,
  ext_title TEXT,
  ext_source_kind TEXT
    -- agency = 정부 기관의 고지·성명·안내문 (보도자료 표 밖, 특히 외국 기관). 5차 추가.
    -- own = 지배상식 자체 집계(예: Europe PMC 연도별 논문 수). own 행은 license link_only. 8차 추가.
    CHECK (ext_source_kind IN ('disclosure_kr', 'disclosure_us', 'grant',
                               'registry', 'agency', 'company_press', 'news', 'own')),

  -- ★ 이용 조건. 행의 종류에 따라 허용 값이 다르다 (아래 ds_question_evidence_license).
  --   논문 · 보도자료 행: cc0 · cc_by · public_domain (비우면 원천 표의 값을 따른다)
  --   외부 원천 행     : cc0 · cc_by · public_domain · kogl_1 · link_only (필수)
  --   link_only 행은 제목 · 주소 · 종류 · 메모(note)만 갖는다. 사실 문장을 담지 않는다.
  --   SEC EDGAR 공시는 link_only 로 둔다 (D28).
  license TEXT,

  -- 인라인 태그 [E1] 의 이름 (D36). 발행 틀이 위첨자 번호로 바꾼다.
  tag TEXT CHECK (tag ~ '^[A-Z]{1,2}[0-9]{0,2}$'),

  -- ②-1 사실 카드 (D33). 원천 언어 그대로의 사실 문장 한두 개.
  --   초록·공개 요약에서 뽑은 문장이므로 넘지 않는 선 2번(저장은 제목·초록·서지·링크뿐)
  --   안에 있다. 본문 문단을 옮기지 않는다. link_only 행에는 넣을 수 없다.
  fact_sentence TEXT,

  slot TEXT NOT NULL
    CHECK (slot IN ('premise', 'exception', 'mechanism', 'industry')),

  -- validation = 검증 V3 에서 찾은 첫 증거 (D26)
  added_by TEXT NOT NULL
    CHECK (added_by IN ('validation', 'search', 'daily', 'owner')),

  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ★ 원천은 정확히 하나.
  CONSTRAINT ds_question_evidence_exactly_one
    CHECK (num_nonnulls(paper_id, gov_press_id, ext_url) = 1),

  -- ★ 외부 원천이면 제목 · 종류가 모두 있어야 한다. 아니면 모두 비어야 한다.
  CONSTRAINT ds_question_evidence_ext_complete
    CHECK (
      (ext_url IS NULL AND ext_title IS NULL AND ext_source_kind IS NULL)
      OR (ext_url IS NOT NULL AND ext_title IS NOT NULL AND ext_source_kind IS NOT NULL)
    ),

  -- ★ 라이선스 CHECK 두 갈래.
  CONSTRAINT ds_question_evidence_license
    CHECK (
      CASE WHEN ext_url IS NULL
        THEN license IS NULL OR license IN ('cc0', 'cc_by', 'public_domain')
        ELSE license IN ('cc0', 'cc_by', 'public_domain', 'kogl_1', 'link_only')
      END
    ),

  -- ★ link_only 행은 사실 문장을 담지 않는다.
  CONSTRAINT ds_question_evidence_link_only_bare
    CHECK (license IS DISTINCT FROM 'link_only' OR fact_sentence IS NULL),

  -- ★ 자체 집계(own)는 링크만 둔다.
  CONSTRAINT ds_question_evidence_own_link_only
    CHECK (ext_source_kind IS DISTINCT FROM 'own' OR license = 'link_only')
);

CREATE INDEX IF NOT EXISTS idx_ds_question_evidence_question
  ON public.ds_question_evidence (question_id, slot);

-- 같은 질문의 같은 칸에 같은 원천을 두 번 넣지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ds_question_evidence_paper
  ON public.ds_question_evidence (question_id, slot, paper_id) WHERE paper_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ds_question_evidence_press
  ON public.ds_question_evidence (question_id, slot, gov_press_id) WHERE gov_press_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ds_question_evidence_ext
  ON public.ds_question_evidence (question_id, slot, ext_url) WHERE ext_url IS NOT NULL;

COMMENT ON TABLE public.ds_question_evidence IS
  '재료 네 칸 · 외부 원천은 링크만 저장한다 · link_only 행은 제목·주소·종류·메모만 갖는다';
COMMENT ON COLUMN public.ds_question_evidence.fact_sentence IS
  '사실 카드(D33) · 원천 언어 문장 · 초록·공개 요약에서 뽑으므로 넘지 않는 선 2번 안';


-- ===========================================================================
-- 3. ds_letters.question_id · 글이 어느 질문의 답인가
-- ===========================================================================
-- 기존 레터 행은 NULL 로 남는다. 채우지 않는다.
ALTER TABLE public.ds_letters
  ADD COLUMN IF NOT EXISTS question_id UUID
    REFERENCES public.ds_questions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_ds_letters_question
  ON public.ds_letters (question_id) WHERE question_id IS NOT NULL;


-- ===========================================================================
-- 4. ds_letter_sources · 외부 1차 공시 허용
-- ===========================================================================
-- 기존 행은 고치지 않는다. 새 열은 NULL 로 더해지고, 기존 행은 모두
-- "paper 또는 gov_press 중 하나" 이므로 새 제약도 그대로 만족한다.
ALTER TABLE public.ds_letter_sources ADD COLUMN IF NOT EXISTS ext_url TEXT;
ALTER TABLE public.ds_letter_sources ADD COLUMN IF NOT EXISTS ext_title TEXT;
ALTER TABLE public.ds_letter_sources ADD COLUMN IF NOT EXISTS ext_source_kind TEXT;
ALTER TABLE public.ds_letter_sources ADD COLUMN IF NOT EXISTS license TEXT;
-- 인라인 태그 [E1] 의 이름 (D36). 기존 행은 NULL 로 남는다.
ALTER TABLE public.ds_letter_sources ADD COLUMN IF NOT EXISTS tag TEXT;

-- 한 레터 안에서 태그는 하나의 원천만 가리킨다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ds_letter_sources_tag
  ON public.ds_letter_sources (letter_id, tag) WHERE tag IS NOT NULL;

DO $$
BEGIN
  -- 옛 제약(paper · gov_press 둘 중 하나)을 셋 중 하나로 바꾼다.
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'ds_letter_sources_exactly_one'
               AND conrelid = 'public.ds_letter_sources'::regclass
               AND pg_get_constraintdef(oid) NOT LIKE '%num_nonnulls%') THEN
    ALTER TABLE public.ds_letter_sources DROP CONSTRAINT ds_letter_sources_exactly_one;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ds_letter_sources_exactly_one'
                   AND conrelid = 'public.ds_letter_sources'::regclass) THEN
    ALTER TABLE public.ds_letter_sources ADD CONSTRAINT ds_letter_sources_exactly_one
      CHECK (num_nonnulls(paper_id, gov_press_id, ext_url) = 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ds_letter_sources_ext_kind'
                   AND conrelid = 'public.ds_letter_sources'::regclass) THEN
    ALTER TABLE public.ds_letter_sources ADD CONSTRAINT ds_letter_sources_ext_kind
      CHECK (ext_source_kind IN ('disclosure_kr', 'disclosure_us', 'grant',
                                 'registry', 'agency', 'company_press', 'news', 'own'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ds_letter_sources_license'
                   AND conrelid = 'public.ds_letter_sources'::regclass) THEN
    -- 기존 행은 ext_url 이 NULL 이고 license 도 NULL 이므로 첫 갈래를 만족한다.
    ALTER TABLE public.ds_letter_sources ADD CONSTRAINT ds_letter_sources_license
      CHECK (
        CASE WHEN ext_url IS NULL
          THEN license IS NULL OR license IN ('cc0', 'cc_by', 'public_domain')
          ELSE license IN ('cc0', 'cc_by', 'public_domain', 'kogl_1', 'link_only')
        END
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ds_letter_sources_tag_format'
                   AND conrelid = 'public.ds_letter_sources'::regclass) THEN
    ALTER TABLE public.ds_letter_sources ADD CONSTRAINT ds_letter_sources_tag_format
      CHECK (tag ~ '^[A-Z]{1,2}[0-9]{0,2}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ds_letter_sources_own_link_only'
                   AND conrelid = 'public.ds_letter_sources'::regclass) THEN
    ALTER TABLE public.ds_letter_sources ADD CONSTRAINT ds_letter_sources_own_link_only
      CHECK (ext_source_kind IS DISTINCT FROM 'own' OR license = 'link_only');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'ds_letter_sources_ext_complete'
                   AND conrelid = 'public.ds_letter_sources'::regclass) THEN
    ALTER TABLE public.ds_letter_sources ADD CONSTRAINT ds_letter_sources_ext_complete
      CHECK (
        (ext_url IS NULL AND ext_title IS NULL AND ext_source_kind IS NULL)
        OR (ext_url IS NOT NULL AND ext_title IS NOT NULL AND ext_source_kind IS NOT NULL)
      );
  END IF;
END $$;


-- ===========================================================================
-- 5. RLS · 켜기만 한다. 정책은 0개 (D22 · service_role 만 닿는다)
-- ===========================================================================
ALTER TABLE public.ds_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_question_evidence ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- 6. 검증
-- ===========================================================================

-- 6-1. 표와 열이 생겼는가 (기대: 3줄 이상, 각 표 이름이 보인다)
SELECT table_name, count(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ds_questions', 'ds_question_evidence')
GROUP BY table_name;

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ds_letters' AND column_name = 'question_id';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ds_letter_sources' AND (column_name LIKE 'ext_%' OR column_name IN ('license', 'tag'))
ORDER BY column_name;

-- 6-2. 기존 행이 새 제약을 만족하는가 (기대: 0)
SELECT count(*) AS broken_letter_sources
FROM public.ds_letter_sources
WHERE num_nonnulls(paper_id, gov_press_id, ext_url) <> 1;

-- 6-3. 일부러 실패해야 하는 INSERT 5개.
--      각 INSERT 가 막히면 NOTICE "OK" 를 남긴다. 막히지 않으면 예외를 던져
--      이 블록 전체가 되돌려진다. 성공해도 실패해도 시험 행은 남지 않는다.
DO $$
DECLARE
  qid UUID;
BEGIN
  INSERT INTO public.ds_questions (question, seed_kind)
  VALUES ('[시험] 지워질 질문', 'owner')
  RETURNING id INTO qid;

  -- ① 칸 값 오류: slot 이 네 칸 밖이다
  BEGIN
    INSERT INTO public.ds_question_evidence (question_id, ext_url, ext_title, ext_source_kind, license, slot, added_by)
    VALUES (qid, 'https://example.org/1', '시험', 'disclosure_us', 'link_only', 'hook', 'owner');
    RAISE EXCEPTION '실패해야 할 INSERT ① 이 통과했다 (slot CHECK 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK ① slot 오류가 막혔다';
  END;

  -- ② 라이선스 오류: 허용 목록 밖(cc_by_nc)
  BEGIN
    INSERT INTO public.ds_question_evidence (question_id, ext_url, ext_title, ext_source_kind, license, slot, added_by)
    VALUES (qid, 'https://example.org/2', '시험', 'news', 'cc_by_nc', 'industry', 'owner');
    RAISE EXCEPTION '실패해야 할 INSERT ② 가 통과했다 (license CHECK 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK ② 라이선스 오류가 막혔다';
  END;

  -- ③ 원천 두 개 동시: paper_id 와 ext_url 을 함께 채운다
  BEGIN
    INSERT INTO public.ds_question_evidence (question_id, paper_id, ext_url, ext_title, ext_source_kind, license, slot, added_by)
    VALUES (qid, gen_random_uuid(), 'https://example.org/3', '시험', 'disclosure_kr', 'public_domain', 'mechanism', 'owner');
    RAISE EXCEPTION '실패해야 할 INSERT ③ 이 통과했다 (exactly_one CHECK 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK ③ 원천 두 개 동시가 막혔다';
  END;

  -- ④ 논문 행에 link_only 지정: link_only 는 외부 원천 행만 쓸 수 있다.
  --    존재하는 논문 한 편을 골라 쓴다. 논문이 없으면 이 시험은 건너뛴다.
  IF EXISTS (SELECT 1 FROM public.ds_papers) THEN
    BEGIN
      INSERT INTO public.ds_question_evidence (question_id, paper_id, license, slot, added_by)
      VALUES (qid, (SELECT id FROM public.ds_papers LIMIT 1), 'link_only', 'mechanism', 'owner');
      RAISE EXCEPTION '실패해야 할 INSERT ④ 가 통과했다 (license 두 갈래 CHECK 없음)';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'OK ④ 논문 행의 link_only 가 막혔다';
    END;
  ELSE
    RAISE NOTICE '④ 건너뜀 — ds_papers 가 비어 있다';
  END IF;

  -- ⑤ tag 형식 오류: 소문자와 세 글자 숫자는 허용 형식 밖이다.
  BEGIN
    INSERT INTO public.ds_question_evidence (question_id, ext_url, ext_title, ext_source_kind, license, tag, slot, added_by)
    VALUES (qid, 'https://example.org/5', '시험', 'own', 'link_only', 'e123', 'premise', 'owner');
    RAISE EXCEPTION '실패해야 할 INSERT ⑤ 가 통과했다 (tag CHECK 없음)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK ⑤ tag 형식 오류가 막혔다';
  END;

  DELETE FROM public.ds_questions WHERE id = qid;
END $$;

-- 6-4. 시험 행이 남지 않았는가 (기대: 0)
SELECT count(*) AS leftover_test_rows FROM public.ds_questions WHERE question LIKE '[시험]%';


-- ===========================================================================
-- 되돌리기 (필요할 때만 · 주석 해제 후 실행)
-- ===========================================================================
-- ALTER TABLE public.ds_letters DROP COLUMN IF EXISTS question_id;
-- DROP TABLE IF EXISTS public.ds_question_evidence;
-- DROP TABLE IF EXISTS public.ds_questions;
-- ds_letter_sources 의 ext_* 열과 제약은 기존 행이 쓰지 않으므로 남겨도 해가 없다.
