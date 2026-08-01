"use client";

import { useState } from "react";
import type {
  ExtractedContent,
  SavedClipping,
  SummarizeResult,
} from "@/lib/content-ingest/types";

type Stage = "idle" | "processing" | "result" | "saving" | "saved" | "error";

export function IngestForm() {
  const [input, setInput] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<ExtractedContent | null>(null);
  const [summary, setSummary] = useState<SummarizeResult | null>(null);
  const [saved, setSaved] = useState<SavedClipping | null>(null);

  const trimmed = input.trim();
  const isUrl = /^https?:\/\/\S+$/.test(trimmed);
  const canSubmit = trimmed.length > 0 && stage !== "processing";

  async function handleSummarize() {
    if (!canSubmit) return;
    setStage("processing");
    setError(null);
    setContent(null);
    setSummary(null);
    setSaved(null);

    const body = isUrl ? { url: trimmed } : { text: trimmed };

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `요약 실패 (${res.status})`);
      }
      setContent(json.content);
      setSummary(json.summary);
      setStage("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }

  async function handleSave() {
    if (!content || !summary) return;
    setStage("saving");
    setError(null);
    try {
      const res = await fetch("/api/ingest/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, summary }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || `저장 실패 (${res.status})`);
      }
      setSaved(json.saved);
      setStage("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("error");
    }
  }

  function handleReset() {
    setInput("");
    setContent(null);
    setSummary(null);
    setSaved(null);
    setError(null);
    setStage("idle");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[color:var(--border)]/60 bg-[color:var(--card)] p-4">
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          입력 · URL 또는 텍스트 붙여넣기
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={stage === "processing" || stage === "saving"}
          placeholder={`https://www.tiktok.com/@user/video/123...\n\n또는 텍스트/메일 본문 붙여넣기`}
          rows={8}
          className="w-full resize-y rounded border border-[color:var(--border)]/50 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-[color:var(--foreground)]/40"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {trimmed.length > 0 && (isUrl ? "→ URL 감지" : `→ 텍스트 ${trimmed.length}자`)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={stage === "processing" || stage === "saving"}
              className="rounded border border-[color:var(--border)]/50 px-3 py-1 text-xs hover:bg-[color:var(--muted)]/20 disabled:opacity-40"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={handleSummarize}
              disabled={!canSubmit}
              className="rounded bg-foreground px-4 py-1 text-xs font-medium text-background hover:opacity-80 disabled:opacity-40"
            >
              {stage === "processing" ? "🌀 요약 중… (~5초)" : "🚀 요약하기"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          ✗ {error}
        </div>
      )}

      {stage !== "idle" && stage !== "processing" && content && summary && (
        <div className="rounded-lg border border-[color:var(--border)]/60 bg-[color:var(--card)] p-4 space-y-4">
          {content.title && (
            <div className="text-sm">
              <span className="text-muted-foreground">제목: </span>
              <span className="font-medium">{content.title}</span>
            </div>
          )}
          {content.url && (
            <div className="text-xs text-muted-foreground">
              <a
                href={content.url}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                {content.url}
              </a>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              📝 요약
            </h3>
            <ul className="space-y-1 text-sm">
              {summary.summary.map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              💡 인사이트
            </h3>
            <ul className="space-y-1 text-sm">
              {summary.insights.map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-sky-950 px-2 py-0.5 text-sky-300">
              🎯 {summary.domain}
            </span>
            {summary.tags.map((t, i) => (
              <span
                key={i}
                className="rounded bg-[color:var(--muted)]/30 px-2 py-0.5 text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[color:var(--border)]/40 pt-4">
            {saved ? (
              <div className="text-xs text-emerald-400">
                ✓ 저장됨 · <code>{saved.filename}</code>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                확인 후 Obsidian 저장 가능
              </div>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={stage === "saving" || stage === "saved"}
              className="rounded border border-emerald-700 bg-emerald-950 px-4 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-900 disabled:opacity-40"
            >
              {stage === "saving" ? "💾 저장 중…" : stage === "saved" ? "✓ 저장 완료" : "💾 Obsidian 저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
