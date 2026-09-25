"use client";

// 달력과 승인 창. 날짜를 고르는 방법은 세 가지다 —
// 빈 날짜의 ＋ 를 누르거나, 글을 끌어다 놓거나, 날짜를 직접 적는다.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { formatKstDate, formatKstDateTime } from "@/lib/dominance/kst";
import type { LetterStatus } from "@/lib/dominance/types";
import { sendTestEmail } from "../review/[id]/actions";
import { approveLetter, recheckLinks, unapproveLetter } from "./actions";

type Row = {
  id: string;
  title: string;
  status: LetterStatus;
  scheduled_for: string | null;
  reviewed_at: string | null;
  revision_count: number;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
// 월·수·금. 추천일일 뿐이고 데이터베이스와 크론에는 요일 조건이 없다.
const RECOMMENDED = new Set([1, 3, 5]);

const APPROVE_CHECKS = [
  "리뷰를 끝낸 글임을 확인했습니다.",
  "메일 모양을 테스트 발송으로 확인했습니다.",
] as const;

export function ScheduleCalendar({
  month,
  today,
  bounds,
  prevHref,
  nextHref,
  todayHref,
  scheduled,
  pool,
}: {
  month: string;
  today: string;
  bounds: {
    dayCount: number;
    firstWeekday: number;
    year: number;
    monthNumber: number;
  };
  prevHref: string;
  nextHref: string;
  todayHref: string;
  scheduled: Row[];
  pool: Row[];
}) {
  const [target, setTarget] = useState<{ letter: Row; date: string } | null>(
    null,
  );
  const [picking, setPicking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byDate = new Map<string, Row[]>();
  for (const row of scheduled) {
    if (!row.scheduled_for) continue;
    const list = byDate.get(row.scheduled_for) ?? [];
    list.push(row);
    byDate.set(row.scheduled_for, list);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const dateOf = (day: number) => `${month}-${pad(day)}`;

  function openApproval(letter: Row, date: string) {
    setError(null);
    setNotice(null);
    setPicking(null);
    if (date < today) {
      setError("지난 날짜에는 붙일 수 없습니다.");
      return;
    }
    setTarget({ letter, date });
  }

  function onDrop(date: string, letterId: string) {
    const letter =
      pool.find((r) => r.id === letterId) ??
      scheduled.find((r) => r.id === letterId);
    if (!letter) return;
    if (letter.status === "published") {
      setError("이미 발행된 글은 날짜를 바꿀 수 없습니다.");
      return;
    }
    openApproval(letter, date);
  }

  function onUnapprove(letterId: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await unapproveLetter(letterId);
      if (result.error) setError(result.error);
      else setNotice("승인을 취소했습니다. 리뷰 통과 상태로 돌아갔습니다.");
    });
  }

  const leading = bounds.firstWeekday;
  const cellCount = Math.ceil((leading + bounds.dayCount) / 7) * 7;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <NavLink href={prevHref}>◀ 지난달</NavLink>
          <span className="px-1 font-medium">
            {bounds.year}년 {bounds.monthNumber}월
          </span>
          <NavLink href={nextHref}>다음달 ▶</NavLink>
          <NavLink href={todayHref}>오늘로</NavLink>
        </div>
        <p className="text-xs text-muted-foreground">
          ● 발행 완료 · ◐ 발행 예정 · ＋ 비어 있음 · 옅은 칸은 추천 요일(월·수·금)
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-[color:var(--border)]/70">
        <div className="grid grid-cols-7 border-b border-[color:var(--border)]/60 bg-surface/40">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`px-2 py-1.5 text-center text-[11px] ${
                RECOMMENDED.has(i)
                  ? "font-medium text-foreground/85"
                  : "text-muted-foreground"
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: cellCount }, (_, i) => {
            const day = i - leading + 1;
            const inMonth = day >= 1 && day <= bounds.dayCount;
            const weekday = i % 7;
            const date = inMonth ? dateOf(day) : null;
            const entries = date ? (byDate.get(date) ?? []) : [];
            const past = date !== null && date < today;

            return (
              <div
                key={i}
                onDragOver={(e) => {
                  if (inMonth && !past) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!date || past) return;
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) onDrop(date, id);
                }}
                className={`min-h-24 border-b border-r border-[color:var(--border)]/40 p-1.5 ${
                  !inMonth
                    ? "bg-background/40"
                    : RECOMMENDED.has(weekday)
                      ? "bg-surface/25"
                      : ""
                } ${date === today ? "ring-1 ring-inset ring-[color:var(--accent)]" : ""}`}
              >
                {inMonth && date && (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span
                        className={`text-[11px] ${past ? "text-muted-foreground/60" : "text-foreground/80"}`}
                      >
                        {day}
                      </span>
                      {date === today && (
                        <span className="text-[10px] text-[color:var(--accent)]">
                          오늘
                        </span>
                      )}
                    </div>

                    <div className="mt-1 space-y-1">
                      {entries.map((row) => (
                        <div
                          key={row.id}
                          draggable={row.status === "approved"}
                          onDragStart={(e) =>
                            e.dataTransfer.setData("text/plain", row.id)
                          }
                          className={`rounded px-1 py-0.5 text-[10px] leading-snug ${
                            row.status === "published"
                              ? "bg-emerald-500/15 text-emerald-200"
                              : "cursor-grab bg-sky-500/15 text-sky-200"
                          }`}
                        >
                          <Link
                            href={`/dominance/review/${row.id}`}
                            className="line-clamp-2 hover:underline"
                          >
                            {row.status === "published" ? "●" : "◐"} {row.title}
                          </Link>
                          {row.status === "approved" && (
                            <button
                              type="button"
                              onClick={() => onUnapprove(row.id)}
                              disabled={pending}
                              className="mt-0.5 text-[9px] text-sky-300/70 hover:text-sky-200 disabled:opacity-50"
                            >
                              승인 취소
                            </button>
                          )}
                        </div>
                      ))}

                      {entries.length === 0 &&
                        (past ? (
                          <span className="text-[11px] text-muted-foreground/40">
                            ·
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setPicking(picking === date ? null : date)
                            }
                            disabled={pool.length === 0}
                            className="w-full rounded border border-dashed border-[color:var(--border)]/60 py-1 text-[11px] text-muted-foreground hover:border-[color:var(--accent)] hover:text-foreground disabled:opacity-40"
                          >
                            ＋
                          </button>
                        ))}
                    </div>

                    {picking === date && (
                      <div className="mt-1 space-y-1 rounded border border-[color:var(--border)] bg-background p-1">
                        {pool.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => openApproval(row, date)}
                            className="block w-full text-left text-[10px] leading-snug text-foreground/85 hover:text-white"
                          >
                            {row.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {notice && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200">
          {error}
        </p>
      )}

      <Pool pool={pool} today={today} onPick={openApproval} />

      {target && (
        <ApprovalDialog
          letter={target.letter}
          date={target.date}
          onClose={() => setTarget(null)}
          onDone={(warning) => {
            setTarget(null);
            setNotice(
              warning
                ? `날짜를 확정했습니다. ${warning}`
                : "날짜를 확정했습니다.",
            );
          }}
        />
      )}
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-foreground/85 hover:border-[color:var(--accent)]"
    >
      {children}
    </Link>
  );
}

/** 리뷰를 통과했고 날짜가 없는 글. 끌어다 놓거나 날짜를 직접 적는다. */
function Pool({
  pool,
  today,
  onPick,
}: {
  pool: Row[];
  today: string;
  onPick: (letter: Row, date: string) => void;
}) {
  const [typed, setTyped] = useState<Record<string, string>>({});

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-medium">날짜를 기다리는 글 {pool.length}편</h2>
        <span className="text-xs text-muted-foreground">
          달력으로 끌어다 놓거나 날짜를 직접 적으십시오.
        </span>
      </div>

      {pool.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--border)]/70 p-8 text-center text-sm text-muted-foreground">
          리뷰를 통과한 글이 없습니다.{" "}
          <Link href="/dominance/review" className="underline">
            ④ 리뷰
          </Link>
          에서 먼저 통과시키십시오.
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--border)]/60 rounded-xl border border-[color:var(--border)]/70 bg-surface/30">
          {pool.map((row) => (
            <li
              key={row.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", row.id)}
              className="flex flex-wrap items-center gap-3 p-4"
            >
              <span className="cursor-grab text-xs text-muted-foreground">
                ⠿
              </span>
              <Link
                href={`/dominance/review/${row.id}`}
                className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-white"
              >
                {row.title}
              </Link>
              <span className="text-xs text-muted-foreground">
                리뷰 완료 {formatKstDateTime(row.reviewed_at)} · 되돌린 횟수{" "}
                {row.revision_count}
              </span>
              <input
                type="date"
                min={today}
                value={typed[row.id] ?? ""}
                onChange={(e) =>
                  setTyped((prev) => ({ ...prev, [row.id]: e.target.value }))
                }
                className="rounded-md border border-[color:var(--border)] bg-background/60 px-2 py-1 text-xs outline-none focus:border-[color:var(--accent)]"
              />
              <button
                type="button"
                disabled={!typed[row.id]}
                onClick={() => onPick(row, typed[row.id])}
                className="rounded-md border border-[color:var(--border)] px-2.5 py-1 text-xs text-foreground/85 hover:border-[color:var(--accent)] disabled:opacity-40"
              >
                붙이기
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 승인 창 · 확인은 두 가지만 한다. ④에서 본 것을 또 체크하게 하면 형식으로 넘긴다. */
function ApprovalDialog({
  letter,
  date,
  onClose,
  onDone,
}: {
  letter: Row;
  date: string;
  onClose: () => void;
  onDone: (warning: string | null) => void;
}) {
  const [ticked, setTicked] = useState<boolean[]>(
    APPROVE_CHECKS.map(() => false),
  );
  const [links, setLinks] = useState<{
    ok: boolean;
    detail: string;
    checkedAt: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 승인 시점에 링크를 한 번 더 확인한다. ④ 이후에 원천이 내려갈 수 있다.
  useEffect(() => {
    let live = true;
    recheckLinks(letter.id).then((result) => {
      if (live) setLinks(result);
    });
    return () => {
      live = false;
    };
  }, [letter.id]);

  const ready = links?.ok === true && ticked.every(Boolean) && !pending;

  function onTestSend() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await sendTestEmail(letter.id);
      if (result.error) setError(result.error);
      else setMessage(`${result.to} 로 테스트 메일을 보냈습니다.`);
    });
  }

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveLetter(letter.id, date);
      if (result.error) setError(result.error);
      else onDone(result.warning);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-[color:var(--border)] bg-background p-5">
        <div>
          <h2 className="text-sm font-medium">
            {formatKstDate(date)} 에 발행
          </h2>
          <p className="mt-2 text-sm text-foreground/90">{letter.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            리뷰 완료 {formatKstDateTime(letter.reviewed_at)} · 되돌린 횟수{" "}
            {letter.revision_count}
          </p>
        </div>

        <ul className="space-y-2">
          {APPROVE_CHECKS.map((label, i) => (
            <li key={label}>
              <label className="flex cursor-pointer gap-2 text-xs leading-relaxed text-foreground/85">
                <input
                  type="checkbox"
                  checked={ticked[i]}
                  onChange={(e) =>
                    setTicked((prev) =>
                      prev.map((v, j) => (j === i ? e.target.checked : v)),
                    )
                  }
                  className="mt-0.5 size-3.5 shrink-0 accent-[color:var(--accent)]"
                />
                {label}
              </label>
            </li>
          ))}
        </ul>

        <p className="text-xs">
          <span className="text-muted-foreground">원천 링크 재점검: </span>
          {links === null ? (
            <span className="text-muted-foreground">확인 중…</span>
          ) : links.ok ? (
            <span className="text-emerald-300">
              {links.detail} ({formatKstDateTime(links.checkedAt)})
            </span>
          ) : (
            <span className="text-red-300">{links.detail}</span>
          )}
        </p>

        {message && <p className="text-xs text-emerald-300">{message}</p>}
        {error && <p className="text-xs text-red-300">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTestSend}
            disabled={pending}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-foreground/85 hover:border-[color:var(--accent)] disabled:opacity-50"
          >
            내게 테스트 발송
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={!ready}
            className="ml-auto rounded-md bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-[color:var(--muted)]/30 disabled:text-muted-foreground"
          >
            승인하고 날짜 확정
          </button>
        </div>
      </div>
    </div>
  );
}
