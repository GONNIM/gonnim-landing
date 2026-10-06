"use client";

// 56차 C · 서버 동작 단추 · 누르면 바로 잠기고 회전 표시와 「처리 중…」이 보인다. 끝나면 원래 글자로 돌아온다.
// 두 번 누르기는 ref 로 막는다(상태 갱신을 기다리지 않음). 결과는 알림 띠(Toast)로 낸다.
// run 이 { ok, text } 를 돌려주면 그 글자를 그대로 띠에 쓴다. 아무것도 돌려주지 않으면 띠를 내지 않는다.

import { useRef, useState } from "react";
import { useActionStatus, type ToastInput } from "./ActionStatus";
import { Progress, type LiveStep, type Stage } from "./Progress";

export type RunResult = ToastInput | null | void;
export type StepFn = (i: number, n: number, name: string) => void;

const BTN = "shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs disabled:opacity-40";
export const BTN_PLAIN = `${BTN} border-[color:var(--border)] text-foreground/85 hover:border-[color:var(--accent)]`;
export const BTN_ACCENT = `${BTN} border-[color:var(--accent)] text-foreground hover:bg-[color:var(--accent)]/10`;

export function Spinner() {
  return (
    <svg aria-hidden className="h-3 w-3 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" data-spinner>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ActionButton({
  run,
  children,
  pendingText = "처리 중…",
  stages,
  disabled,
  title,
  confirm,
  className = BTN_PLAIN,
  accent,
}: {
  run: (step: StepFn) => Promise<RunResult>;
  children: React.ReactNode;
  pendingText?: string;
  /** 30초 넘는 동작의 어림 단계 · 실제 단계는 run 이 step() 으로 알린다 */
  stages?: Stage[];
  disabled?: boolean;
  title?: string;
  /** 누르기 전에 묻는 글자(기존 확인 창 글자) */
  confirm?: string;
  className?: string;
  accent?: boolean;
}) {
  const { begin, toast } = useActionStatus();
  const lock = useRef(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [live, setLive] = useState<LiveStep | null>(null);
  const running = startedAt !== null;

  async function onClick() {
    if (lock.current) return;
    if (confirm && !window.confirm(confirm)) return;
    lock.current = true;
    setStartedAt(Date.now());
    setLive(null);
    const end = begin();
    try {
      const r = await run((i, n, name) => setLive({ i, n, name }));
      if (r && r.text) toast(r);
    } catch (err) {
      toast({ ok: false, text: `실패 · ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      end();
      lock.current = false;
      setStartedAt(null);
      setLive(null);
    }
  }

  const cls = accent ? BTN_ACCENT : className;
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || running}
      aria-busy={running}
      className={`${cls} inline-flex items-center justify-center gap-1.5 ${title ? "disabled:pointer-events-none" : ""}`}
    >
      {running && <Spinner />}
      {running ? pendingText : children}
    </button>
  );
  const withTitle = title ? (
    <span title={title} className="inline-flex shrink-0">
      {button}
    </span>
  ) : (
    button
  );
  if (!running || (!stages && !live)) return withTitle;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {withTitle}
      <Progress startedAt={startedAt} live={live} stages={stages} />
    </span>
  );
}
