"use client";

// 60차 B · 「변환」 절 · 블로그 글 · 쇼츠 대본. 만든 판은 목록으로 보이고, 고른 판의 본문과 「복사」 단추를 보인다.

import { useState } from "react";
import { ActionButton, BTN_ACCENT, BTN_PLAIN, type RunResult } from "../../_ui/ActionButton";
import { formatKstDateTime } from "@/lib/dominance/kst";
import type { ConvertFile, ConvertKind } from "@/lib/dominance/convert";
import { convertLetter } from "./actions";

const KINDS: { kind: ConvertKind; make: string; label: string }[] = [
  { kind: "blog", make: "블로그 글 만들기", label: "블로그 글" },
  { kind: "shorts", make: "쇼츠 대본 만들기", label: "쇼츠 대본" },
];

const usd = (c: number | null) => (c === null ? "비용 모름" : `$${c.toFixed(4)}`);

export function ConvertPanel({ letterId, initial }: { letterId: string; initial: ConvertFile[] }) {
  const [files, setFiles] = useState(initial);
  const [shown, setShown] = useState<Record<ConvertKind, string | null>>({ blog: null, shorts: null });
  const [copied, setCopied] = useState<string | null>(null);

  async function make(kind: ConvertKind): Promise<RunResult> {
    const r = await convertLetter(letterId, kind);
    if (r.error || !r.file) return { ok: false, text: `만들지 못했습니다 · ${r.error ?? "결과 없음"}` };
    const file = r.file;
    setFiles((prev) => [file, ...prev]);
    setShown((prev) => ({ ...prev, [kind]: file.name }));
    return { ok: true, text: `${kind === "blog" ? "블로그 글" : "쇼츠 대본"}을 만들었습니다.` };
  }

  async function copy(file: ConvertFile) {
    try {
      await navigator.clipboard.writeText(file.text);
      setCopied(file.name);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-[color:var(--border)] p-4">
      <div>
        <h2 className="text-lg font-medium">변환</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          이 글의 꾸러미(본문 · 원천)만 씁니다. 글은 바꾸지 않습니다. 블로그 글은 본문 문장을 그대로 옮기고, 쇼츠 대본은 GLM 이 씁니다.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {KINDS.map(({ kind, make: makeLabel, label }) => {
          const list = files.filter((f) => f.info.kind === kind);
          const current = list.find((f) => f.name === shown[kind]) ?? list[0] ?? null;
          return (
            <div key={kind} className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">{label}</h3>
                <ActionButton run={() => make(kind)} accent pendingText="만드는 중…">
                  {list.length ? "다시 만들기" : makeLabel}
                </ActionButton>
              </div>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground">아직 만든 판이 없습니다.</p>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-1.5 text-xs">
                    {list.map((f, i) => (
                      <li key={f.name}>
                        <button
                          type="button"
                          onClick={() => setShown((prev) => ({ ...prev, [kind]: f.name }))}
                          className={f.name === current?.name ? BTN_ACCENT : BTN_PLAIN}
                        >
                          {list.length - i}판 · {f.info.at ? formatKstDateTime(f.info.at) : f.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {current && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {current.info.model ? `${current.info.model} · ${current.info.attempts}번 부름 · ` : "LLM 없음 · "}
                          {usd(current.info.cost)}
                        </span>
                        {current.info.problems.length > 0 && (
                          <span className="text-amber-700 dark:text-amber-300">검사에 걸림: {current.info.problems.join(" · ")}</span>
                        )}
                        <button type="button" onClick={() => copy(current)} className={`${BTN_PLAIN} ml-auto`}>
                          {copied === current.name ? "복사했습니다" : "복사"}
                        </button>
                      </div>
                      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border border-[color:var(--border)]/70 bg-surface/30 p-3 text-xs leading-relaxed text-foreground">
                        {current.text}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
