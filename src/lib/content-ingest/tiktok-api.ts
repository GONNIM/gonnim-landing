// tikwm.com — TikTok 무공식 메타·미디어 API 클라이언트
//
// 사유: TikTok 페이지는 SPA · JS 렌더링 · 순수 fetch 로 본문 추출 불가.
//       tikwm.com 은 서버 측에서 TikTok 데이터를 파싱해 JSON 응답 제공.
// 안정성: 무료 3자 서비스 · 언제든 종료/rate limit 가능성 존재.
// 프라이버시: URL 만 전달 · 개인 데이터 없음.

export type TikTokMeta = {
  id: string;
  title: string | null;
  authorNickname: string | null;
  authorUniqueId: string | null;
  region: string | null;
  durationSec: number | null;
  playCount: number | null;
  createTime: string | null;
  captions: string[]; // content_desc 배열 (TikTok 자체 자막 · 있으면)
  audioUrl: string | null; // mp3 direct URL (STT 입력)
  videoUrl: string | null; // mp4 direct URL
  coverUrl: string | null;
  originalUrl: string;
};

const TIKWM_ENDPOINT = "https://tikwm.com/api/";
const FETCH_TIMEOUT_MS = 20_000;

export async function fetchTikTokMeta(url: string): Promise<TikTokMeta> {
  const params = new URLSearchParams({ url, hd: "0" });
  const endpoint = `${TIKWM_ENDPOINT}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let json: TikwmResponse;
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`tikwm.com fetch 실패 · ${res.status} ${res.statusText}`);
    }
    json = (await res.json()) as TikwmResponse;
  } finally {
    clearTimeout(timer);
  }

  if (json.code !== 0 || !json.data) {
    throw new Error(`tikwm.com 응답 실패 · code=${json.code} · msg=${json.msg ?? "-"}`);
  }

  const d = json.data;
  return {
    id: d.id,
    title: (d.title ?? "").trim() || null,
    authorNickname: d.author?.nickname?.trim() || null,
    authorUniqueId: d.author?.unique_id?.trim() || null,
    region: d.region ?? null,
    durationSec: typeof d.duration === "number" ? d.duration : null,
    playCount: typeof d.play_count === "number" ? d.play_count : null,
    createTime:
      typeof d.create_time === "number"
        ? new Date(d.create_time * 1000).toISOString()
        : null,
    captions: Array.isArray(d.content_desc)
      ? d.content_desc.map((s) => String(s).trim()).filter((s) => s.length > 0)
      : [],
    audioUrl: d.music || null,
    videoUrl: d.play || null,
    coverUrl: d.cover || null,
    originalUrl: url,
  };
}

type TikwmResponse = {
  code: number;
  msg?: string;
  data?: {
    id: string;
    title?: string;
    region?: string;
    content_desc?: unknown[];
    duration?: number;
    play?: string;
    music?: string;
    cover?: string;
    play_count?: number;
    create_time?: number;
    author?: {
      unique_id?: string;
      nickname?: string;
    };
  };
};
