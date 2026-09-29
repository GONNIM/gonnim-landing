"use client";

import { AREAS } from "@/lib/dominance/questions";
import type { IssueFields } from "./actions";

export function FieldsEditor({ value: f, onChange }: { value: IssueFields; onChange: (f: IssueFields) => void }) {
  const input =
    "w-full rounded-md border border-[color:var(--border)] bg-background px-2.5 py-1.5 text-sm text-foreground";
  const set = (k: keyof IssueFields, v: string) => onChange({ ...f, [k]: v });
  const setQ = (i: number, v: string) => {
    const queries = [...f.queries];
    queries[i] = v;
    onChange({ ...f, queries });
  };
  return (
    <div className="grid gap-2 text-xs text-muted-foreground">
      <label className="grid gap-1">
        질문
        <input className={input} value={f.question} onChange={(e) => set("question", e.target.value)} />
      </label>
      <label className="grid gap-1">
        통설
        <input className={input} value={f.premise} onChange={(e) => set("premise", e.target.value)} />
      </label>
      <label className="grid gap-1">
        되묻기
        <input className={input} value={f.twist} onChange={(e) => set("twist", e.target.value)} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          검색어 ① (영어)
          <input className={`${input} font-mono`} value={f.queries[0] ?? ""} onChange={(e) => setQ(0, e.target.value)} />
        </label>
        <label className="grid gap-1">
          검색어 ② (영어)
          <input className={`${input} font-mono`} value={f.queries[1] ?? ""} onChange={(e) => setQ(1, e.target.value)} />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          계열
          <input className={input} value={f.series} onChange={(e) => set("series", e.target.value)} />
        </label>
        <label className="grid gap-1">
          영역
          <select className={input} value={f.area} onChange={(e) => set("area", e.target.value)}>
            <option value="">—</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  disabled,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1 text-xs disabled:opacity-40 ${
        accent
          ? "border-[color:var(--accent)] text-foreground hover:bg-[color:var(--accent)]/10"
          : "border-[color:var(--border)] text-foreground/85 hover:border-[color:var(--accent)]"
      }`}
    >
      {children}
    </button>
  );
}
