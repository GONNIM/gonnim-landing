"use client";

// [이슈 만들기] · 문장 · 주제어 · 링크 세 가지로 받는다.
// [채우기] 는 LLM 1회로 칸을 채운다. 모든 칸은 저장 전에 고칠 수 있다. 저장한 이슈는 '제안' 상태로
// 들어가고, 채택하려면 검증을 거쳐야 한다(넘지 않는 선 7).

import { useState } from "react";
import { ActionButton, type RunResult } from "../_ui/ActionButton";
import { useActionStatus } from "../_ui/ActionStatus";
import type { FillMode } from "@/lib/dominance/question-llm";
import { fillAction, saveIssueAction, type IssueFields, type IssueSignal } from "./actions";
import { FieldsEditor } from "./ui";

const MODES: { key: FillMode; label: string; placeholder: string }[] = [
  { key: "sentence", label: "① 문장", placeholder: "예: 커피를 마시면 정말 탈수가 오는가?" },
  { key: "topic", label: "② 주제어", placeholder: "예: 간헐적 단식, 근육" },
  { key: "link", label: "③ 링크", placeholder: "https://… (제목만 읽고 본문은 읽지 않습니다)" },
];

const EMPTY: IssueFields = { question: "", premise: "", twist: "", series: "", area: "", queries: ["", ""] };

export function IssueMaker({
  onSaved,
  onDuplicate,
  signal = null,
}: {
  onSaved: (id: string) => void;
  onDuplicate: (id: string) => void;
  /** 36차 C · ⓪-0 신호에서 왔으면 주제어 칸에 문서명을 넣고 출처를 보인다. 질문 문장은 비운다(D41) */
  signal?: IssueSignal | null;
}) {
  const [mode, setMode] = useState<FillMode>(signal ? "topic" : "sentence");
  const [text, setText] = useState(signal ? signal.title.replace(/_/g, " ") : "");
  const [manualTitle, setManualTitle] = useState("");
  const [needTitle, setNeedTitle] = useState(false);
  const [linkTitle, setLinkTitle] = useState<string | null>(null);
  const [fields, setFields] = useState<IssueFields>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const { busy: pending } = useActionStatus();

  // 56차 C · 결과 글자를 돌려주면 ActionButton 이 알림 띠로 낸다
  async function fill(): Promise<RunResult> {
    setMsg(null);
    {
      const r = await fillAction({ mode, text, manualTitle: needTitle ? manualTitle : undefined });
      if (!r.ok) {
        setMsg(r.error);
        if (r.needTitle) setNeedTitle(true);
        return { ok: false, text: r.error };
      }
      setLinkTitle(r.linkTitle);
      setFields({
        question: r.filled.question,
        premise: r.filled.premise,
        twist: r.filled.twist,
        series: r.filled.series,
        area: r.filled.area ?? "",
        queries: [r.filled.queries[0] ?? "", r.filled.queries[1] ?? ""],
      });
      const done = `채웠습니다 · ${(r.ms / 1000).toFixed(1)}초${r.linkTitle ? ` · 읽은 제목: ${r.linkTitle}` : ""}. 칸을 확인하고 고치십시오.`;
      setMsg(done);
      return { ok: true, text: done };
    }
  }

  async function save(): Promise<RunResult> {
    setMsg(null);
    {
      const f = mode === "sentence" && !fields.question.trim() ? { ...fields, question: text } : fields;
      const r = await saveIssueAction({ mode, text, linkTitle: linkTitle ?? (manualTitle.trim() || null), fields: f, signal });
      if (r.ok) {
        setText("");
        setFields(EMPTY);
        onSaved(r.id);
        return { ok: true, text: "이슈를 저장했습니다" };
      }
      setMsg(r.error);
      if (r.duplicateId) onDuplicate(r.duplicateId);
      return { ok: false, text: r.error };
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-[color:var(--accent)]/60 bg-surface/40 p-5">
      {signal && (
        <p className="rounded-md border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs text-foreground/85">
          신호에서: {signal.src === "wiki-ko" ? "위키 ko" : "위키 en"} · {signal.title.replace(/_/g, " ")} · 7일 조회{" "}
          {signal.views.toLocaleString("ko-KR")} · 지난주 대비 {signal.delta === null ? "첫 주" : signal.delta.toLocaleString("ko-KR")} ·
          주 시작 {signal.week}. 저장하면 갈래가 S5 트렌드(trend)로 들어갑니다. 질문 문장은 직접 쓰십시오.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => {
              setMode(m.key);
              setNeedTitle(false);
              setLinkTitle(null);
            }}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              mode === m.key
                ? "border-[color:var(--accent)] text-foreground"
                : "border-[color:var(--border)] text-muted-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={MODES.find((m) => m.key === mode)!.placeholder}
          className="w-full rounded-md border border-[color:var(--border)] bg-background px-3 py-2 text-sm"
        />
        <ActionButton run={fill} disabled={pending || !text.trim()} accent pendingText="채우는 중…">
          채우기
        </ActionButton>
      </div>

      {mode === "link" && needTitle && (
        <input
          value={manualTitle}
          onChange={(e) => setManualTitle(e.target.value)}
          placeholder="페이지 제목을 직접 적어 주십시오"
          className="w-full rounded-md border border-amber-500/50 bg-background px-3 py-2 text-sm"
        />
      )}

      {msg && <p className="text-xs text-foreground/80">{msg}</p>}

      <FieldsEditor value={fields} onChange={setFields} />

      <div className="flex items-center gap-2">
        <ActionButton run={save} disabled={pending || !(fields.question.trim() || (mode === "sentence" && text.trim()))} accent>
          저장
        </ActionButton>
        <span className="text-xs text-muted-foreground">저장하면 &lsquo;제안&rsquo; 상태로 들어갑니다. 채택 전에 검증을 거칩니다.</span>
      </div>
    </section>
  );
}
