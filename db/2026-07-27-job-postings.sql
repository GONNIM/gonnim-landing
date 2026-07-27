-- Sprint W1 · 채용공고 크롤 · 시장 요구 signal 발굴 · Sprint Radar 확장
-- 등록일: 2026-07-27 (사용자 아이디어 · Daily 07-27 §떠오른 생각)
-- 목적: "채용공고 주요업무 = 현 시점 IT업계 요구 자질·능력 = 경쟁력·상품"
--       사용자 자산 (Pocket RAG · Multi-Agent · MCP · 비정형 문서 파싱) 매치 채용 = 사업화 signal
-- 원천: wanted (API v4) · jobkorea · saramin (후속 진입 결정)
-- 실행: Supabase Dashboard → SQL Editor (프로젝트: snzfurthbijuqdkxpddn)
-- 롤백: 하단 주석 DROP

CREATE TABLE IF NOT EXISTS public.job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 원천
  source TEXT NOT NULL CHECK (source IN ('wanted', 'jobkorea', 'saramin')),
  external_id TEXT NOT NULL,           -- 예: "377326" (원티드 job id)
  external_url TEXT NOT NULL,           -- 예: "https://www.wanted.co.kr/wd/377326"

  -- 기본 메타
  title TEXT NOT NULL,                  -- 채용 제목 (position)
  company TEXT NOT NULL,                -- company.name
  company_industry TEXT,                -- company.industry_name
  category TEXT,                        -- category_tags[0]
  location TEXT,                        -- address
  annual_from INT,                      -- 연봉 하한 (만원 단위)
  annual_to INT,                        -- 연봉 상한

  -- 상세 (핵심 시장 signal)
  main_tasks TEXT,                      -- ★ 주요업무 · 사용자 자산 매치 판정 핵심
  requirements TEXT,                    -- 자격요건
  preferred_points TEXT,                -- 우대사항
  intro TEXT,                           -- 회사·팀 소개
  benefits TEXT,                        -- 복지

  -- 기술 스택 (skill_tags 배열)
  skill_tags TEXT[],                    -- ['Python', 'FastAPI', 'PyTorch', ...]

  -- 시각
  published_at TIMESTAMPTZ,
  due_time TIMESTAMPTZ,

  -- Raw
  raw_data JSONB,

  -- LLM 판정 (후속 · MVP nullable)
  llm_market_signal TEXT,               -- 이 채용이 드러내는 시장 pain·요구 (2~3문장)
  llm_user_asset_match TEXT,            -- 사용자 자산 매치 근거
  llm_business_grade TEXT CHECK (
    llm_business_grade IS NULL OR llm_business_grade IN ('A', 'B', 'C', 'D')
  ),
  llm_analyzed_at TIMESTAMPTZ,

  -- 메타
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source, external_id)
);

-- 인덱스 · 조회 최적화
CREATE INDEX IF NOT EXISTS idx_job_postings_source_published
  ON public.job_postings (source, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_first_seen
  ON public.job_postings (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_grade
  ON public.job_postings (llm_business_grade)
  WHERE llm_business_grade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_postings_skill_tags
  ON public.job_postings USING GIN (skill_tags);

-- RLS · 인증된 사용자 read-only
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_postings_read_auth" ON public.job_postings;
CREATE POLICY "job_postings_read_auth"
  ON public.job_postings FOR SELECT
  TO authenticated
  USING (true);

-- 코멘트
COMMENT ON TABLE public.job_postings IS '채용공고 크롤 · 주요업무 = 시장 요구 signal · 사용자 자산 매치 사업화 발굴';
COMMENT ON COLUMN public.job_postings.main_tasks IS '주요업무 · 시장 pain·요구 signal 핵심 필드';
COMMENT ON COLUMN public.job_postings.skill_tags IS '정확한 기술 스택 배열 · GIN 인덱스 · 매치 검색 최적';
COMMENT ON COLUMN public.job_postings.llm_business_grade IS 'LLM 판정 사용자 자산 매치 등급 · 후속 job-judge';

-- === 확인 쿼리 ===
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'job_postings' ORDER BY ordinal_position;

-- === 롤백 ===
-- DROP TABLE IF EXISTS public.job_postings CASCADE;
