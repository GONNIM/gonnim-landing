-- Sprint W1 · 사업화 타당성 리포트 · 통합 마이그레이션
-- 등록일: 2026-07-18
-- 이전 두 파일 (add-insight-report.sql · add-badges.sql) 을 모두 포함.
-- 이유: 두 파일 실행 여부 불확실 · IF NOT EXISTS 로 idempotent 하게 재실행 안전.
--
-- 실행 위치: Supabase Dashboard → SQL Editor
--   프로젝트: snzfurthbijuqdkxpddn (production · gon-nnim-landing 백엔드)
--
-- 실행 후 확인: 아래 SELECT 로 5개 컬럼 이름이 모두 반환되어야 성공.
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'applications'
--       AND column_name IN ('insight_report','insight_generated_at',
--                           'competition_level','business_grade','go_decision');

-- 1) 리포트 markdown 본문
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS insight_report TEXT;

-- 2) 리포트 생성 시각
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS insight_generated_at TIMESTAMPTZ;

-- 3) 경쟁 강도 판정 (Red · Yellow · Blue)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS competition_level TEXT
  CHECK (competition_level IS NULL OR competition_level IN ('red', 'yellow', 'blue'));

-- 4) 사업화 매력도 등급 (A · B · C · D)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS business_grade TEXT
  CHECK (business_grade IS NULL OR business_grade IN ('A', 'B', 'C', 'D'));

-- 5) go_decision (구 스키마 · UI 미사용이지만 코드 참조 흔적 있어 안전 추가)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS go_decision TEXT
  CHECK (go_decision IS NULL OR go_decision IN ('go', 'no-go', 'conditional'));

-- 코멘트
COMMENT ON COLUMN public.applications.insight_report
  IS '사업화 타당성 리포트 markdown 본문 (7섹션)';
COMMENT ON COLUMN public.applications.insight_generated_at
  IS '마지막 리포트 생성 시각';
COMMENT ON COLUMN public.applications.competition_level
  IS '경쟁 강도 · red=포화 · yellow=각도 존재 · blue=미개척';
COMMENT ON COLUMN public.applications.business_grade
  IS '사업화 매력도 · A=강추 · B=조건부 · C=재검토 · D=제외';

-- 실행 후 확인 쿼리 (Supabase SQL Editor 에서 별도 셀로 실행)
-- SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'applications'
--     AND column_name IN ('insight_report','insight_generated_at',
--                         'competition_level','business_grade','go_decision')
--   ORDER BY column_name;
