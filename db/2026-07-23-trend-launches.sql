-- Sprint W1 · IT 트렌드 원천 통합 저장 · trend_launches 테이블 신설
-- 등록일: 2026-07-23 (P-Insights-Ext · Product Hunt 통합)
-- 사용자 확정 · Q10 Wiki+Radar 분리 · Q5 하이브리드
-- 실행: Supabase Dashboard → SQL Editor (프로젝트: snzfurthbijuqdkxpddn)
-- 롤백: 하단 주석 DROP

-- 확장 원천 (source enum):
--   product-hunt · indie-hackers · show-hn · reddit-sideproject
--   hn · github-trending · hugging-face
--   medium · geeknews · yozm · velog (후속)
CREATE TABLE IF NOT EXISTS public.trend_launches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 원천
  source TEXT NOT NULL CHECK (source IN (
    'product-hunt', 'indie-hackers', 'show-hn', 'reddit-sideproject',
    'hn', 'github-trending', 'hugging-face',
    'medium', 'geeknews', 'yozm', 'velog'
  )),
  external_id TEXT NOT NULL,
  external_url TEXT NOT NULL,

  -- 기본 데이터
  title TEXT NOT NULL,
  tagline TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  raw_data JSONB,

  -- LLM 판정 (후속 P-LLM-Judge · MVP 는 NULL)
  llm_business_grade TEXT CHECK (
    llm_business_grade IS NULL OR llm_business_grade IN ('A', 'B', 'C', 'D')
  ),
  llm_market_pain TEXT,
  llm_analyzed_at TIMESTAMPTZ,

  -- 승격 (후속 P-Wiki-Route · MVP 는 default FALSE)
  promoted_to_idea BOOLEAN DEFAULT FALSE,
  promoted_at TIMESTAMPTZ,
  wiki_note_path TEXT,

  -- 메타
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source, external_id)
);

-- 인덱스 · 최근 조회 · 원천 필터
CREATE INDEX IF NOT EXISTS idx_trend_launches_source_published
  ON public.trend_launches (source, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_trend_launches_first_seen
  ON public.trend_launches (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_trend_launches_grade
  ON public.trend_launches (llm_business_grade)
  WHERE llm_business_grade IS NOT NULL;

-- RLS · 인증된 사용자 read-only (서비스 role 만 write)
ALTER TABLE public.trend_launches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trend_launches_read_auth" ON public.trend_launches;
CREATE POLICY "trend_launches_read_auth"
  ON public.trend_launches FOR SELECT
  TO authenticated
  USING (true);

-- 코멘트
COMMENT ON TABLE public.trend_launches IS 'IT 트렌드 launch (Product Hunt · 인디해커 등) · Wiki+DB 하이브리드 저장 · Radar 뷰어';
COMMENT ON COLUMN public.trend_launches.source IS '원천 채널 · product-hunt/indie-hackers/show-hn/...';
COMMENT ON COLUMN public.trend_launches.llm_business_grade IS '사업화 판정 등급 (후속 P-LLM-Judge · MVP nullable)';
COMMENT ON COLUMN public.trend_launches.promoted_to_idea IS 'Wiki Ideas/ 승격 여부 (후속 P-Wiki-Route)';

-- === 확인 쿼리 (성공 시 컬럼 목록 반환) ===
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'trend_launches' ORDER BY ordinal_position;

-- === 롤백 (필요 시만) ===
-- DROP TABLE IF EXISTS public.trend_launches CASCADE;
