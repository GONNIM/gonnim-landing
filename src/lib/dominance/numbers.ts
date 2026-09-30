// 수치 세기 · 초안 고르기(22차 B-1)와 점검(C-1)이 같은 규칙을 쓴다. 클라이언트에서도 쓴다.
//
// 수치 = 숫자 덩어리 하나(범위 "6,000~8,000" 은 하나로 센다). 연도("1965년" · "2022")와 태그 [E1] 는 세지 않는다.

const TAG = /\[[A-Z]{1,2}[0-9]{0,2}\]/g;
const YEAR = /(?<![\d.,])(?:19|20)\d{2}(?![\d.,])(?:\s*년)?/g;
const NUM = /\d[\d,.·]*(?:\s*[~\-–]\s*\d[\d,.·]*)?/g;

export function countNumbers(text: string): number {
  return (text.replace(TAG, "").replace(YEAR, "").match(NUM) ?? []).length;
}

/** 표본 크기나 추적 기간이 든 문장인가 (원문 영어 또는 한국어 뜻) */
export function hasSampleOrFollowup(text: string): boolean {
  return (
    /\b\d[\d,\s]*\d?\s*(participants|adults|people|individuals|patients|children|subjects|men|women|students|players|workers|adolescents|cohorts)\b/i.test(text) ||
    /follow-?up|followed (for|up)/i.test(text) ||
    /\d[\d,]*\s*(만\s*)?(천\s*)?명/.test(text) ||
    /추적/.test(text)
  );
}
