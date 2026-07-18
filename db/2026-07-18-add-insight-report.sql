-- Sprint W1 · 정밀 분석 리포트 기능 (Go/No-go + 상용화 방향)
-- 등록일: 2026-07-18
-- 실행 위치: Supabase Dashboard → SQL Editor → 아래 3 문장 그대로 실행
-- 롤백: 이 파일 하단 주석의 DROP 문장 실행

-- 1) 리포트 markdown 본문
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS insight_report TEXT;

-- 2) LLM 이 판정한 진행 결정 (go / no-go / conditional / null)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS go_decision TEXT
  CHECK (go_decision IS NULL OR go_decision IN ('go', 'no-go', 'conditional'));

-- 3) 리포트 생성 시각 (재실행 시 갱신)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS insight_generated_at TIMESTAMPTZ;

-- 확인
COMMENT ON COLUMN public.applications.insight_report
  IS 'Sprint 정밀 분석 리포트 본문 (markdown · 5섹션)';
COMMENT ON COLUMN public.applications.go_decision
  IS 'LLM 판정 Go/No-go/Conditional';
COMMENT ON COLUMN public.applications.insight_generated_at
  IS '마지막 정밀 분석 리포트 생성 시각';

-- === 롤백 (필요 시만 실행) ===
-- ALTER TABLE public.applications DROP COLUMN IF EXISTS insight_report;
-- ALTER TABLE public.applications DROP COLUMN IF EXISTS go_decision;
-- ALTER TABLE public.applications DROP COLUMN IF EXISTS insight_generated_at;
