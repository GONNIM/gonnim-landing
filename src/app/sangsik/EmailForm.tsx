"use client";

// 가입 · 수신거부 요청이 같이 쓰는 이메일 한 칸짜리 양식.
import Link from "next/link";
import { useState } from "react";

export function EmailForm({
  endpoint,
  withConsent,
  submitLabel,
  doneMessage,
}: {
  endpoint: string;
  withConsent: boolean;
  submitLabel: string;
  doneMessage: string;
}) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (withConsent && !consent) {
      setError("개인정보 처리 방침에 동의해 주십시오.");
      return;
    }
    setState("sending");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) setState("done");
      else {
        setError(data.error ?? "지금은 처리하지 못했습니다.");
        setState("idle");
      }
    } catch {
      setError("연결이 끊겼습니다. 잠시 뒤에 다시 시도해 주십시오.");
      setState("idle");
    }
  }

  if (state === "done") {
    return <p className="text-[15px] leading-7">{doneMessage}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일 주소"
        className="w-full rounded-md border border-[#d1d5db] px-3 py-2.5 text-[15px] outline-none focus:border-[#111827]"
      />
      {/* 사람은 보지 못하는 칸. 자동 입력만 채운다. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        aria-hidden="true"
      />
      {withConsent && (
        <label className="flex gap-2 text-sm leading-6 text-[#374151]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1.5"
          />
          <span>
            이메일을 레터 발송에만 쓰며 언제든 수신거부할 수 있다는{" "}
            <Link href="/sangsik/privacy" className="underline">
              개인정보 처리 방침
            </Link>
            을 읽고 동의합니다.
          </span>
        </label>
      )}
      {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-md bg-[#111827] px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {state === "sending" ? "보내는 중…" : submitLabel}
      </button>
    </form>
  );
}
