// 53차 I · 제목 · 부제목 추천의 묶음 유형. 화면(클라이언트)도 읽으므로 LLM 코드와 떼어 둔다.
export type TitleType = "question" | "flip" | "apply";
export const TITLE_TYPE_LABEL: Record<TitleType, string> = { question: "질문형", flip: "통설 뒤집기", apply: "내 몸 적용" };
