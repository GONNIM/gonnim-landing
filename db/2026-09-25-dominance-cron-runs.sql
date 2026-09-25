-- 지배상식 · ds_cron_runs 신설 (크론 실행 이력)
-- 대상 프로젝트: sprint-dominance (https://drfhvmhtfhdwicgynwzi.supabase.co)
-- 실행: Supabase Dashboard → SQL Editor → 전체 붙여넣고 Run
-- 롤백: 하단 주석 참조
--
-- ★ 왜 이 표가 있는가
--   원본 앱이 죽은 이유는 파이프라인 정지가 아니라 16개월간 아무도 몰랐다는 것이다.
--   Vercel Hobby 는 크론 실패를 알려주지 않고 런타임 로그를 1시간만 보관한다.
--   22시(UTC) 에 실패하면 아침에는 읽을 수 없다. 그래서 실행 결과를 우리 DB 에 남긴다.
--
-- ★ 성공한 실행도 남긴다
--   실패만 남기면 "실패가 없다" 와 "아예 돌지 않았다" 를 구별할 수 없다.
--   기록이 매일 한 줄 늘어나는 것 자체가 살아 있다는 증거다.
--   비어 있는 날짜가 곧 경보다.

CREATE TABLE IF NOT EXISTS public.ds_cron_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 크론이 판단한 KST 기준 날짜. 화면에서 날짜별로 빠진 날을 찾는 키다.
  run_date DATE NOT NULL,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- success  다섯 단계가 모두 끝났다
  -- partial  일부 단계가 실패했으나 나머지는 돌았다
  -- failed   경로 자체가 터졌다
  status TEXT NOT NULL
    CHECK (status IN ('success', 'partial', 'failed')),

  -- 실패한 단계 이름만 따로 둔다. JSON 을 열지 않고 목록에서 바로 읽기 위한 것이다.
  failed_steps TEXT[] NOT NULL DEFAULT '{}',

  -- 단계별 보고 원본. 크론 응답과 같은 모양이라 화면과 응답이 어긋나지 않는다.
  steps JSONB,

  -- ⑤단계가 모은 경보. 메일이 실패해도 여기에는 남는다.
  alert_count INTEGER NOT NULL DEFAULT 0,
  alerts JSONB,

  -- 경보 메일 발송 결과. 키가 없거나 권한이 모자라면 여기에 사유가 남는다.
  alert_mail_sent BOOLEAN NOT NULL DEFAULT FALSE,
  alert_mail_error TEXT,

  -- 외부 하트비트(healthchecks.io) 를 찌른 결과.
  --   ok       정상 신호를 보냈다
  --   fail     실패 신호를 보냈다
  --   skipped  DS_HEARTBEAT_URL 이 없어 찌르지 않았다
  --   error    찌르려 했으나 실패했다
  heartbeat TEXT NOT NULL DEFAULT 'skipped'
    CHECK (heartbeat IN ('ok', 'fail', 'skipped', 'error')),

  -- 한 줄 요약. 목록에서 눈으로 훑는 용도다.
  summary TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ★ 끝나지 않은 실행에 걸린 시간이 들어가는 것을 막는다.
  CONSTRAINT ds_cron_runs_duration_needs_end
    CHECK (duration_ms IS NULL OR ended_at IS NOT NULL)
);

-- 화면의 유일한 조회 패턴: 최신순 목록
CREATE INDEX IF NOT EXISTS idx_ds_cron_runs_started
  ON public.ds_cron_runs (started_at DESC);

-- 날짜로 빠진 날을 찾는 조회
CREATE INDEX IF NOT EXISTS idx_ds_cron_runs_date
  ON public.ds_cron_runs (run_date DESC);

-- ★ RLS 를 켜고 정책은 만들지 않는다 (D22).
--   이 프로젝트에는 로그인이 없다. 접근은 gonnim-landing 세션 확인을 거친
--   service_role 로만 이루어진다. service_role 은 RLS 를 우회한다.
--   정책을 만들면 "누군가 인증된다" 는 착각을 남기므로 만들지 않는다.
ALTER TABLE public.ds_cron_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ds_cron_runs IS
  '크론 실행 이력 · Vercel Hobby 는 로그를 1시간만 남기므로 여기에 보관한다. 성공도 남긴다 — 빠진 날짜가 경보다';
COMMENT ON COLUMN public.ds_cron_runs.failed_steps IS
  '실패 단계 이름. JSON 을 열지 않고 목록에서 읽기 위한 중복 저장이다';
COMMENT ON COLUMN public.ds_cron_runs.heartbeat IS
  'skipped = DS_HEARTBEAT_URL 없음 · error = 찌르기 자체가 실패';

-- === 확인 쿼리 ===
-- SELECT run_date, status, failed_steps, alert_count, heartbeat, duration_ms
--   FROM public.ds_cron_runs ORDER BY started_at DESC LIMIT 20;

-- === 롤백 (필요 시만) ===
-- DROP TABLE IF EXISTS public.ds_cron_runs CASCADE;
