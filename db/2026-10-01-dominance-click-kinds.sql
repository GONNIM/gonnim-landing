-- 2026-10-01 · 지배상식 · 클릭 종류 칸 (26차 C-1) · sprint-dominance SQL Editor 에서 운영자가 실행
--
-- ds_letter_reactions 에 링크 종류별 클릭 수를 담는 칸 하나를 더한다.
-- {"source": 3, "web": 1, "unsubscribe": 0, "react": 2, "vote": 1, "other": 0}
-- 개인 정보는 없다. 이 SQL 전에는 코드가 next_votes 의 "_clicks" 키에 임시로 센다. 화면은 둘을 더해 보여 준다.
-- 다시 실행해도 안전하다(IF NOT EXISTS).

ALTER TABLE public.ds_letter_reactions
  ADD COLUMN IF NOT EXISTS click_kinds JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ds_letter_reactions.click_kinds IS
  '링크 종류별 클릭 수(원천 · 웹에서 보기 · 수신거부 · 반응 · 투표 · 기타) · 레터별 집계만 (26차)';

-- 확인: 한 줄이 나와야 한다.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ds_letter_reactions' AND column_name = 'click_kinds';
