-- Sprint W1 · 사업화 결정 · Sprint 진행 상태 컬럼
-- 등록일: 2026-07-18 (Sprint Radar Phase 6)
-- 실행 위치: Supabase Dashboard → SQL Editor (프로젝트: snzfurthbijuqdkxpddn)
-- 롤백: 하단 주석 DROP

-- 1) Sprint 진행 상태
--   candidate  = 후보 (business_grade A/B 이나 결정 안 함)
--   pursuing   = Sprint 진행 결정 · MVP 계획 수립 단계
--   kicked-off = Kickoff.md 편입 · 실 개발 착수
--   dropped   = 제외 결정 (등급 낮음 · 자산 정합 실패 · 사용자 판단)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS sprint_status TEXT
  CHECK (sprint_status IS NULL OR sprint_status IN ('candidate', 'pursuing', 'kicked-off', 'dropped'));

-- 2) Sprint 결정 시각
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS sprint_decided_at TIMESTAMPTZ;

COMMENT ON COLUMN public.applications.sprint_status
  IS 'Sprint 진행 상태 · candidate/pursuing/kicked-off/dropped';
COMMENT ON COLUMN public.applications.sprint_decided_at
  IS 'Sprint 진행 결정 시각 · Kickoff 자동 동기화 기준';

-- === 확인 쿼리 (성공 시 2행 반환) ===
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'applications'
--    AND column_name IN ('sprint_status', 'sprint_decided_at')
--  ORDER BY column_name;

-- === 롤백 (필요 시만) ===
-- ALTER TABLE public.applications DROP COLUMN IF EXISTS sprint_status;
-- ALTER TABLE public.applications DROP COLUMN IF EXISTS sprint_decided_at;
