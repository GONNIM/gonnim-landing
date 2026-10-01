"use client";

import { useState, useTransition } from "react";
import { saveRepliesAction } from "./actions";

export function RepliesInput({ letterId, value }: { letterId: string; value: number }) {
  const [v, setV] = useState(String(value));
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={v}
        inputMode="numeric"
        onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))}
        className="w-14 rounded border border-[color:var(--border)] bg-transparent px-1 py-0.5 text-right text-xs"
        aria-label="답장 수"
      />
      <button
        type="button"
        disabled={pending || v === String(value)}
        onClick={() =>
          startTransition(async () => {
            const r = await saveRepliesAction(letterId, Number(v || 0));
            setNote(r.error ?? "저장");
          })
        }
        className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[11px] disabled:opacity-40"
      >
        저장
      </button>
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
    </span>
  );
}
