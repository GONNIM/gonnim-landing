"use client";

// 56차 C · 단계 표시 · 「{단계 번호}/{전체} {단계 이름} · {지난 초}초」.
// 단계는 두 가지로 받는다.
// - 실제 단계: 동작이 단계를 직접 알려 준다(증거 모으기 5단계 · runCollect).
// - 어림 단계: 서버 동작 하나가 안에서 여러 일을 할 때. 지난 시간과 단계별 어림 초로 지금 단계를 고른다.
//   어림 단계는 마지막 단계에서 멈춘다. 서버가 실제로 어디까지 했는지는 모른다.

import { useEffect, useState } from "react";

export type Stage = { name: string; sec: number };
export type LiveStep = { i: number; n: number; name: string };

export function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function stageAt(stages: Stage[], elapsed: number): LiveStep {
  let acc = 0;
  for (const [i, s] of stages.entries()) {
    acc += s.sec;
    if (elapsed < acc) return { i: i + 1, n: stages.length, name: s.name };
  }
  const last = stages.length - 1;
  return { i: last + 1, n: stages.length, name: stages[last].name };
}

export function Progress({ startedAt, live, stages }: { startedAt: number; live?: LiveStep | null; stages?: Stage[] }) {
  const elapsed = useElapsed(startedAt);
  const step = live ?? (stages?.length ? stageAt(stages, elapsed) : null);
  return (
    <span className="text-xs tabular-nums text-muted-foreground" data-progress>
      {step ? `${step.i}/${step.n} ${step.name} · ` : ""}
      {elapsed}초
    </span>
  );
}

/** 오래 걸리는 동작의 어림 단계 · 초는 어림값이다(합이 런북의 실측 범위 안에 들도록 나눔 · 단계별로 재지 않음) */
export const STAGES = {
  validate: [
    { name: "논문 수 세기(V1)", sec: 6 },
    { name: "관련도 판정(V2)", sec: 10 },
    { name: "공개 논문 찾기(V3)", sec: 5 },
    { name: "관심 · 건강 정보(V4~V6)", sec: 5 },
    { name: "검색어 다시 쓰기 · 다시 재기", sec: 20 },
  ],
  write: [
    { name: "사실 카드 읽기", sec: 3 },
    { name: "블록 쓰기", sec: 25 },
    { name: "다시 쓰기 · 검사", sec: 15 },
    { name: "저장", sec: 5 },
  ],
  suggest: [
    { name: "글과 카드 읽기", sec: 2 },
    { name: "모델 추천 받기", sec: 15 },
    { name: "규칙 검사 · 저장", sec: 3 },
  ],
  propose: [
    { name: "제외 목록 읽기", sec: 2 },
    { name: "모델 제안 받기", sec: 25 },
    { name: "같은 문장 거르기 · 저장", sec: 3 },
  ],
  cross: [
    { name: "두 모델에 묻기", sec: 20 },
    { name: "의견 합치기 · 저장", sec: 3 },
  ],
} satisfies Record<string, Stage[]>;
