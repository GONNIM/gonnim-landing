-- Sprint W1 · 사업화 타당성 리포트로 재정의
-- 등록일: 2026-07-18
-- 배경: 리포트 관점을 "지원 판단" → "사업화 가능 여부" 로 전환
--       기존 go_decision 컬럼은 남겨두되 미사용 (데이터 없음 · 향후 재활용 여지)
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 롤백: 하단 주석 DROP 실행

-- 1) 경쟁 강도 판정 (Red · Yellow · Blue)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS competition_level TEXT
  CHECK (competition_level IS NULL OR competition_level IN ('red', 'yellow', 'blue'));

-- 2) 사업화 매력도 등급 (A · B · C · D)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS business_grade TEXT
  CHECK (business_grade IS NULL OR business_grade IN ('A', 'B', 'C', 'D'));

COMMENT ON COLUMN public.applications.competition_level
  IS '경쟁 강도 · red=포화 · yellow=경쟁 있으나 각도 · blue=미개척';
COMMENT ON COLUMN public.applications.business_grade
  IS '사업화 매력도 등급 · A=강추 · B=조건부 · C=재검토 · D=제외';

-- === 롤백 (필요 시만 실행) ===
-- ALTER TABLE public.applications DROP COLUMN IF EXISTS competition_level;
-- ALTER TABLE public.applications DROP COLUMN IF EXISTS business_grade;
