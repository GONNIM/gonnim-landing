-- 지배상식 (Dominance) · 운용 스키마 · 테이블 8종 + 공개 버킷
-- 등록일: 2026-09-25 · 개정 2026-09-25(리뷰 단계 · 검색 · 별도 프로젝트)
-- 실행 대상: Supabase 프로젝트 **sprint-dominance** (drfhvmhtfhdwicgynwzi)
-- 실행: Supabase Dashboard → SQL Editor 에 이 파일 전체를 붙여넣고 Run
-- 롤백: 파일 맨 아래 주석
--
-- ★ 어느 프로젝트에 사는가 (D22, 2026-09-25 사용자 확정)
--   지배상식 데이터는 gonnim-landing 과 **분리된 프로젝트**에 둔다.
--   그래서 접근 경로가 단순해진다 — 콘솔과 크론은 service_role 로만 이 DB 에 닿고,
--   로그인 여부는 gonnim-landing 의 Auth 로 먼저 확인한다.
--   환경변수는 DS_SUPABASE_URL 과 DS_SUPABASE_SERVICE_ROLE_KEY 두 개다.
--
-- ★ 왜 ds_ 접두사를 유지하는가
--   프로젝트가 갈렸으므로 이름 충돌은 없어졌다. 그래도 접두사를 남긴다 —
--   문서·코드·쿼리가 이미 ds_ 로 쓰여 있고, 나중에 두 DB 를 합칠 선택지를 닫지 않는다.
--
-- ★ 설계 원칙: "넘지 않는 선"을 문서가 아니라 제약조건으로 만든다.
--   플래그는 실수로 켜지지만, CHECK 를 통과하지 못한 행은 애초에 생기지 않는다.

-- ===========================================================================
-- 1. ds_papers · 1차 연구 메타데이터
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_papers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  source TEXT NOT NULL
    CHECK (source IN ('arxiv', 'medrxiv', 'biorxiv', 'europepmc')),

  external_id TEXT NOT NULL,
  doi TEXT,

  title TEXT NOT NULL,
  abstract TEXT,
  authors TEXT[],
  published_date DATE,

  -- ★ 허용 목록. 이 밖의 값은 INSERT 가 거부된다.
  --   arXiv 메타데이터 = CC0 / medRxiv·Europe PMC = 논문별 license 필드
  --   미국 정부 저작(EID·EHP 등 5종) = public_domain
  --   NC(비상업)·ND(변형금지)·SA(동일조건전파) 는 전부 목록 밖이다.
  license TEXT NOT NULL
    CHECK (license IN ('cc0', 'cc_by', 'public_domain')),

  -- 원문에서 읽은 라이선스 문자열 원본. 정규화가 틀렸을 때 추적용.
  license_raw TEXT NOT NULL,

  -- 항상 링크아웃한다. 본문을 우리 서버에 두지 않는다(arXiv 약관).
  landing_url TEXT NOT NULL,

  -- ★ 판본 구분. 같은 연구의 게재본과 프리프린트가 라이선스가 다르다.
  --   실증: 10.1038/s41586-026-10932-7 게재본 cc_by / bioRxiv 프리프린트 cc_by_nc_nd
  version TEXT NOT NULL DEFAULT 'preprint'
    CHECK (version IN ('preprint', 'published')),

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data JSONB,

  UNIQUE (source, external_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ds_papers_published ON public.ds_papers (published_date DESC);
CREATE INDEX IF NOT EXISTS idx_ds_papers_doi ON public.ds_papers (doi) WHERE doi IS NOT NULL;

COMMENT ON COLUMN public.ds_papers.license IS '허용 목록 밖이면 행을 만들지 않는다 · NC/ND/SA 제외';

-- ===========================================================================
-- 2. ds_gov_press · 공공누리 제1유형 확인분
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_gov_press (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 2026-09-25 브라우저 실사로 마크 부착을 확인한 기관만.
  -- 식약처는 보도자료에 마크가 없어 제외됐다(부서별 사전 협의 대상).
  agency TEXT NOT NULL
    CHECK (agency IN ('mohw', 'msit', 'kdca')),

  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  published_date DATE,
  landing_url TEXT NOT NULL,

  -- ★ 제1유형만. 제2유형(비상업)·제3·4유형(변형금지)은 INSERT 가 실패한다.
  kogl_type SMALLINT NOT NULL DEFAULT 1 CHECK (kogl_type = 1),

  -- 공공누리 의무 출처표시 문구를 수집 시점에 확정해 행에 저장한다.
  -- 발행 시점에 조립하면 누락될 수 있다.
  attribution TEXT NOT NULL,

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (agency, external_id)
);

COMMENT ON COLUMN public.ds_gov_press.kogl_type IS '제1유형 고정 · 상업적 이용과 변형을 허용하는 유일한 유형';

-- ===========================================================================
-- 3. ds_candidates · 매일 생성되는 후보 (콘솔이 보는 것)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_candidates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 후보가 만들어진 날. 콘솔 "오늘의 후보 10개" 조회 키.
  candidate_date DATE NOT NULL,

  paper_id UUID REFERENCES public.ds_papers(id) ON DELETE CASCADE,
  gov_press_id UUID REFERENCES public.ds_gov_press(id) ON DELETE CASCADE,

  -- ★ 정확히 하나의 원천을 가리킨다.
  CONSTRAINT ds_candidates_exactly_one
    CHECK ((paper_id IS NOT NULL) <> (gov_press_id IS NOT NULL)),

  headline TEXT NOT NULL,
  hook TEXT,

  -- 5개 축 점수 (operations.md). 흥미 30 · 격차 25 · 몸 20 · 산업 15 · 신뢰 10.
  -- breakdown 은 각 축의 근거와 흥미 축의 하위 신호를 담는다.
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  score_breakdown JSONB,

  -- open     아직 글이 없다 (재고)
  -- drafted  콘솔에서 "글 작성하기" 를 눌러 ds_letters 행이 생겼다
  -- used     그 글이 발행됐다
  -- excluded 사람이 제외했거나 신뢰 하한 미달
  state TEXT NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'drafted', 'used', 'excluded')),

  -- 제외 사유를 남긴다. 같은 논문이 다시 후보로 올라오는 것을 막는 근거.
  excluded_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 콘솔의 두 조회 패턴: 오늘자 후보 / 재고(open 전체)
CREATE INDEX IF NOT EXISTS idx_ds_candidates_date
  ON public.ds_candidates (candidate_date DESC, score DESC);
CREATE INDEX IF NOT EXISTS idx_ds_candidates_open
  ON public.ds_candidates (score DESC) WHERE state = 'open';

COMMENT ON TABLE public.ds_candidates IS '글을 쓰지 않은 후보는 state=open 으로 남아 재고가 된다 · 버리지 않는다';

-- ===========================================================================
-- 4. ds_letters · 레터 1편
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_letters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  candidate_id UUID REFERENCES public.ds_candidates(id) ON DELETE SET NULL,

  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,

  -- concept.md 의 구조: 3줄요약 → 훅 → 1차연구(링크아웃) → 메커니즘
  --                      → 산업 → 실천 → 은유
  summary TEXT,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- ★ 콘솔에서 지정하는 발행일. 크론이 매일 "오늘(KST)" 과 비교한다.
  --   요일을 코드에 박지 않는다 — 발행 리듬이 데이터가 된다.
  scheduled_for DATE,

  -- ★ 5단계 흐름 (operations.md)
  --   draft     초안이 나왔고 사람이 고치는 중
  --   review    사람이 [작성 완료] 를 눌렀다. 리뷰를 기다린다
  --   reviewed  리뷰를 끝냈다. 발행일을 붙일 수 있다
  --   approved  발행일이 정해졌다
  --   published 나갔다
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'reviewed', 'approved', 'published')),

  -- 리뷰 단계의 기록. review_checks 는 자동 점검 7항목과 교차 리뷰 의견을
  -- 리뷰 시점 그대로 보관한다. 나중에 "왜 이걸 통과시켰나" 를 추적하는 근거다.
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  review_checks JSONB,

  -- 리뷰에서 편집으로 되돌린 횟수. 자주 되돌아오는 글은 초안 지시문 문제다.
  revision_count INTEGER NOT NULL DEFAULT 0,

  approved_at TIMESTAMPTZ,
  approved_by TEXT,

  published_at TIMESTAMPTZ,

  -- Resend 브로드캐스트 ID. 중복 발송 방지 키.
  -- 웹 발행은 성공하고 발송만 실패했을 때 재시도가 두 번 보내면 안 된다.
  resend_broadcast_id TEXT,
  sent_at TIMESTAMPTZ,

  -- 발송 성과. Resend 통계를 발행 다음 날 크론이 한 번 가져와 채운다.
  -- 어떤 글이 실제로 읽혔는지 모르면 다음 글을 고칠 근거가 없다.
  sent_count INTEGER,
  open_rate NUMERIC(5,2) CHECK (open_rate IS NULL OR open_rate BETWEEN 0 AND 100),
  stats_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ★ 발행 전 레터에 발행 시각이 들어가는 것을 막는다.
  CONSTRAINT ds_letters_published_needs_status
    CHECK (published_at IS NULL OR status = 'published'),

  -- ★ 승인 없이 published 로 갈 수 없다. 사람 승인 게이트의 본체.
  CONSTRAINT ds_letters_published_needs_approval
    CHECK (status <> 'published' OR approved_at IS NOT NULL),

  -- ★ 발행일이 지정되지 않은 글은 발행될 수 없다.
  CONSTRAINT ds_letters_published_needs_schedule
    CHECK (status <> 'published' OR scheduled_for IS NOT NULL),

  -- ★ 리뷰를 거치지 않은 글에는 발행일을 붙일 수 없다.
  --   화면에서만 막으면 실수로 넘어간다. 여기서 막는다.
  CONSTRAINT ds_letters_approved_needs_review
    CHECK (status NOT IN ('approved', 'published') OR reviewed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ds_letters_status ON public.ds_letters (status);

-- 리뷰 대기 목록 / 발행일 붙일 수 있는 글 목록
CREATE INDEX IF NOT EXISTS idx_ds_letters_review_queue
  ON public.ds_letters (updated_at DESC) WHERE status = 'review';
CREATE INDEX IF NOT EXISTS idx_ds_letters_ready
  ON public.ds_letters (reviewed_at DESC) WHERE status = 'reviewed';

-- 크론의 유일한 발행 쿼리: 오늘 예약 + 승인 완료
CREATE INDEX IF NOT EXISTS idx_ds_letters_due
  ON public.ds_letters (scheduled_for)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_ds_letters_published
  ON public.ds_letters (published_at DESC) WHERE status = 'published';

COMMENT ON TABLE public.ds_letters IS '크론은 scheduled_for=오늘(KST) AND status=approved 만 발행한다';
COMMENT ON COLUMN public.ds_letters.scheduled_for IS '콘솔에서 지정 · 비어 있으면 발행되지 않는다(정상 경로)';
COMMENT ON COLUMN public.ds_letters.review_checks IS '리뷰 시점의 자동 점검 결과와 교차 리뷰 의견 스냅샷';

-- ---------------------------------------------------------------------------
-- 4-1. 발행 기록 검색 · /dominance/archive
-- ---------------------------------------------------------------------------
-- 한국어는 형태 분석기가 없으면 to_tsvector 가 제대로 쪼개지 못한다.
-- 수백 편 규모에서는 pg_trgm 부분 일치로 충분하고 오탈자에도 걸린다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 생성 컬럼은 즉시성(IMMUTABLE) 표현식만 받고 서브쿼리를 직접 쓸 수 없다.
-- 블록 배열의 text 를 이어 붙이는 일을 즉시성 함수로 감싼다.
CREATE OR REPLACE FUNCTION public.ds_letter_search_text(
  p_title TEXT, p_summary TEXT, p_blocks JSONB
) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT p_title || ' ' || COALESCE(p_summary, '') || ' ' ||
         COALESCE((SELECT string_agg(b->>'text', ' ')
                   FROM jsonb_array_elements(p_blocks) AS b), '');
$$;

ALTER TABLE public.ds_letters
  ADD COLUMN IF NOT EXISTS search_text TEXT
  GENERATED ALWAYS AS (public.ds_letter_search_text(title, summary, blocks)) STORED;

CREATE INDEX IF NOT EXISTS idx_ds_letters_search
  ON public.ds_letters USING gin (search_text gin_trgm_ops);

COMMENT ON COLUMN public.ds_letters.search_text IS '제목·요약·블록 본문을 이어 붙인 검색용 사본 · 자동 생성';

-- ===========================================================================
-- 5. ds_letter_sources · 사실 문장마다 원천 태그
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_letter_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  letter_id UUID NOT NULL REFERENCES public.ds_letters(id) ON DELETE CASCADE,

  paper_id UUID REFERENCES public.ds_papers(id) ON DELETE RESTRICT,
  gov_press_id UUID REFERENCES public.ds_gov_press(id) ON DELETE RESTRICT,

  block_index INT,
  claim TEXT,

  -- ★ 정확히 하나의 원천을 가리켜야 한다. 타입 혼합을 DB 가 막는다.
  CONSTRAINT ds_letter_sources_exactly_one
    CHECK ((paper_id IS NOT NULL) <> (gov_press_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_ds_letter_sources_letter
  ON public.ds_letter_sources (letter_id);

COMMENT ON TABLE public.ds_letter_sources IS '사실 주장 1건 = 원천 1건 · ON DELETE RESTRICT 로 근거가 사라진 레터를 막는다';

-- ===========================================================================
-- 6. ds_letter_audit · 글 한 편에 일어난 모든 일
-- ===========================================================================
-- 초안 생성뿐 아니라 블록 다시 쓰기, 교차 리뷰, 리뷰 반려·통과를 한 표에 남긴다.
-- 표를 늘리지 않는 이유는 조회 패턴이 "이 글에 무슨 일이 있었나" 하나뿐이기 때문이다.
CREATE TABLE IF NOT EXISTS public.ds_letter_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  letter_id UUID REFERENCES public.ds_letters(id) ON DELETE SET NULL,

  event TEXT NOT NULL DEFAULT 'draft'
    CHECK (event IN ('draft', 'block_rewrite', 'cross_review',
                     'review_reject', 'review_pass')),

  -- 사람이 한 일(review_reject 등)은 모델이 없다.
  model TEXT,
  prompt_input JSONB,
  raw_output TEXT,

  -- 정규식 거절 필터 결과. 걸린 블록은 버리지 않고 플래그를 달아 편집기에 표시한다.
  reject_filters JSONB,
  passed BOOLEAN NOT NULL,

  -- 사람이 남기는 한 줄. 리뷰에서 되돌릴 때 이유를 적는다.
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ds_letter_audit_letter
  ON public.ds_letter_audit (letter_id, created_at DESC);

COMMENT ON TABLE public.ds_letter_audit IS '초안·블록 재작성·교차 리뷰·리뷰 반려를 한 표에 기록한다';

-- ===========================================================================
-- 7. ds_subscribers · 구독자 원장
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  email TEXT NOT NULL UNIQUE,

  -- 더블 옵트인: consent_at 은 폼 제출, confirmed_at 은 확인 메일 클릭.
  -- confirmed_at 이 NULL 인 주소로는 레터를 보내지 않는다.
  consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_ip INET,
  confirm_token UUID NOT NULL DEFAULT gen_random_uuid(),
  confirmed_at TIMESTAMPTZ,

  unsubscribed_at TIMESTAMPTZ,

  -- Resend Audiences 는 발송용 사본이다. 원장은 이 테이블이다.
  resend_contact_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 발송 대상 조회의 유일한 패턴
CREATE INDEX IF NOT EXISTS idx_ds_subscribers_active
  ON public.ds_subscribers (confirmed_at)
  WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL;

COMMENT ON TABLE public.ds_subscribers IS '개인정보처리방침 대상 · confirmed_at IS NULL 이면 발송하지 않는다';
COMMENT ON COLUMN public.ds_subscribers.unsubscribed_at IS '수신거부는 법적 필수 · 행을 삭제하지 않고 시각을 기록해 재구독을 구분한다';

-- ===========================================================================
-- 8. ds_corrections · 정정 이력 (공개)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.ds_corrections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  letter_id UUID NOT NULL REFERENCES public.ds_letters(id) ON DELETE CASCADE,

  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reporter TEXT,
  description TEXT NOT NULL,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,

  is_public BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ds_corrections_letter
  ON public.ds_corrections (letter_id);

COMMENT ON TABLE public.ds_corrections IS '4주간 정정 신고 0건 = 아무도 읽지 않는다는 판정 지표(concept.md)';

-- ===========================================================================
-- RLS · 정책을 하나도 만들지 않는다 (2026-09-25 개정)
-- ===========================================================================
-- ★ 왜 authenticated 읽기 정책을 없앴는가
--   이 표들은 별도 프로젝트 sprint-dominance 에 산다(D22). 콘솔의 로그인 세션은
--   gonnim-landing 프로젝트가 발급하고, 그 토큰은 이 프로젝트에서 통하지 않는다.
--   즉 여기에 authenticated 역할로 들어오는 주체가 없다. 정책을 만들어도 아무 역할을
--   하지 못하면서 "읽기가 열려 있다"는 오해만 남는다.
--
--   대신 접근 경로를 하나로 못 박는다:
--     콘솔·크론  → service_role (RLS 우회) · 세션 확인은 gonnim-landing Auth 로 먼저 한다
--     공개 웹·앱 → 테이블을 보지 않는다. 공개 Storage JSON 만 읽는다
--
--   RLS 를 켜고 정책을 비우면 anon 키로는 어떤 표에서도 0행이 나온다.
--   anon 키가 유출되어도 DB 내용이 새지 않는다.

ALTER TABLE public.ds_papers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_gov_press      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_candidates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_letters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_letter_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_letter_audit   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_subscribers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ds_corrections    ENABLE ROW LEVEL SECURITY;

-- 이전 판을 이미 실행했다면 남아 있는 정책을 지운다.
DROP POLICY IF EXISTS "ds_papers_read_auth"         ON public.ds_papers;
DROP POLICY IF EXISTS "ds_gov_press_read_auth"      ON public.ds_gov_press;
DROP POLICY IF EXISTS "ds_candidates_read_auth"     ON public.ds_candidates;
DROP POLICY IF EXISTS "ds_letters_read_auth"        ON public.ds_letters;
DROP POLICY IF EXISTS "ds_letter_sources_read_auth" ON public.ds_letter_sources;
DROP POLICY IF EXISTS "ds_letter_audit_read_auth"   ON public.ds_letter_audit;
DROP POLICY IF EXISTS "ds_corrections_read_auth"    ON public.ds_corrections;

-- ★ 특히 ds_subscribers 는 어떤 경우에도 읽기를 열지 않는다.
--   구독자 이메일은 개인정보다. 콘솔의 구독자 화면은 집계값만 보여주며
--   service_role 서버 액션으로 개수만 읽는다. 개별 주소는 화면에 그리지 않는다.

-- ===========================================================================
-- 공개 Storage 버킷 · 웹과 앱이 같은 JSON 을 읽는다
-- ===========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('ds-letters', 'ds-letters', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 업로드는 service_role 로만 한다. 쓰기 정책은 의도적으로 만들지 않는다 —
-- anon 키로 발행물을 덮어쓸 수 있으면 승인 게이트를 우회해 아무 내용이나
-- 독자에게 보낼 수 있게 된다.

-- ===========================================================================
-- 검증
-- ===========================================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'ds_%'
ORDER BY table_name;
-- 8행이 나와야 한다.

SELECT id, name, public FROM storage.buckets WHERE id = 'ds-letters';

-- 검색 컬럼과 색인이 만들어졌는지
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ds_letters' AND column_name = 'search_text';
-- 1행이 나와야 한다.

-- 정책이 하나도 없어야 한다 (service_role 만 닿는다)
SELECT count(*) AS policy_count FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'ds_%';
-- 0 이 나와야 한다.

-- 제약조건이 실제로 막는지 확인 (넷 다 ERROR 가 나야 정상)
-- INSERT INTO public.ds_papers (source, external_id, title, license, license_raw, landing_url)
--   VALUES ('medrxiv','t','t','cc_by_nc','cc-by-nc','https://x');      -- 라이선스 위반
-- INSERT INTO public.ds_letters (slug, title, status, published_at, scheduled_for)
--   VALUES ('t','t','draft', NOW(), CURRENT_DATE);                     -- 상태 위반
-- INSERT INTO public.ds_letters (slug, title, status, scheduled_for)
--   VALUES ('t2','t2','published', CURRENT_DATE);                      -- 승인 게이트 위반
-- INSERT INTO public.ds_letters (slug, title, status, scheduled_for, approved_at)
--   VALUES ('t3','t3','approved', CURRENT_DATE, NOW());                -- 리뷰 게이트 위반

-- ===========================================================================
-- 롤백 (필요 시만)
-- ===========================================================================
-- DROP TABLE IF EXISTS public.ds_corrections    CASCADE;
-- DROP TABLE IF EXISTS public.ds_subscribers    CASCADE;
-- DROP TABLE IF EXISTS public.ds_letter_audit   CASCADE;
-- DROP TABLE IF EXISTS public.ds_letter_sources CASCADE;
-- DROP TABLE IF EXISTS public.ds_letters        CASCADE;
-- DROP TABLE IF EXISTS public.ds_candidates     CASCADE;
-- DROP TABLE IF EXISTS public.ds_gov_press      CASCADE;
-- DROP TABLE IF EXISTS public.ds_papers         CASCADE;
-- DROP FUNCTION IF EXISTS public.ds_letter_search_text(TEXT, TEXT, JSONB);
-- DELETE FROM storage.objects WHERE bucket_id = 'ds-letters';
-- DELETE FROM storage.buckets WHERE id = 'ds-letters';
