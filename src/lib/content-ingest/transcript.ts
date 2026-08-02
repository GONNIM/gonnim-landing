// Groq Whisper API 클라이언트 — 오디오 → 텍스트 (한국어 우선)
//
// 엔드포인트: https://api.groq.com/openai/v1/audio/transcriptions
// 모델: whisper-large-v3-turbo (기본 · 빠름) · whisper-large-v3 (더 정확)
// url 파라미터 지원 → Vercel 함수에서 mp3 직접 fetch 안 해도 됨 (Groq 서버 측 fetch)
//
// 무료 티어: 25MB 파일 제한 · rate limit 계정별 · 개인 사용 충분

const GROQ_TRANSCRIPTION_ENDPOINT =
  "https://api.groq.com/openai/v1/audio/transcriptions";

// large-v3-turbo 는 빠르나 짧은 영상·노이즈 환경에서 hallucination 발생.
// 정확도 우선 · large-v3 를 기본으로 사용.
const DEFAULT_MODEL = "whisper-large-v3";
const FETCH_TIMEOUT_MS = 60_000;

export type TranscribeOptions = {
  model?: string;
  language?: string; // ISO-639-1 (ko, en, ja 등)
  prompt?: string; // 도메인 컨텍스트 힌트 (제목·주제) · Whisper 정확도 향상
  temperature?: number; // 0 = deterministic · hallucination 감소
};

export type TranscribeResult = {
  text: string;
  model: string;
  language: string;
};

export async function transcribeFromUrl(
  audioUrl: string,
  options: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "GROQ_API_KEY missing · https://console.groq.com/keys 발급 후 .env.local 등록",
    );
    (err as { status?: number }).status = 503;
    throw err;
  }

  const model = options.model || DEFAULT_MODEL;
  const language = options.language || "ko";

  const form = new FormData();
  form.append("url", audioUrl);
  form.append("model", model);
  form.append("language", language);
  form.append("response_format", "text");
  form.append("temperature", String(options.temperature ?? 0));
  if (options.prompt) form.append("prompt", options.prompt);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let text: string;
  try {
    const res = await fetch(GROQ_TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Groq Whisper 실패 · ${res.status} ${res.statusText} · ${body.slice(0, 300)}`,
      );
    }
    text = (await res.text()).trim();
  } finally {
    clearTimeout(timer);
  }

  if (!text) {
    throw new Error("Groq Whisper 응답이 비어 있음 · 오디오 파일 문제 가능성");
  }

  return { text, model, language };
}
