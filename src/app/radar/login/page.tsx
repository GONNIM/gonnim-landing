// Sprint Radar login · Magic Link + Password + Signup modal.

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";

type Mode = "magic" | "password";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/radar";

  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("hi@gonnim.dev");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPassword2, setSignupPassword2] = useState("");
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupInfo, setSignupInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setMessage(null);

    const supabase = getBrowserClient();

    if (mode === "magic") {
      void next; // TODO: post-MVP restore next routing via cookie
      const redirectTo = `${window.location.origin}/auth/confirm`;

      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      setSending(false);
      if (err) {
        setError(err.message);
      } else {
        setMessage("메일함을 확인하세요. Magic Link로 로그인됩니다.");
      }
      return;
    }

    // Password mode · immediate session · no email round-trip
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setSignupBusy(true);
    setSignupError(null);
    setSignupInfo(null);

    if (signupPassword !== signupPassword2) {
      setSignupBusy(false);
      setSignupError("비밀번호 확인이 일치하지 않습니다");
      return;
    }
    if (signupPassword.length < 8) {
      setSignupBusy(false);
      setSignupError("비밀번호는 8자 이상이어야 합니다");
      return;
    }

    const res = await fetch("/api/radar/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: signupEmail, password: signupPassword }),
    });

    const data = (await res.json()) as {
      created?: boolean;
      updated?: boolean;
      error?: string;
    };

    if (!res.ok) {
      setSignupBusy(false);
      setSignupError(data.error ?? "가입 실패");
      return;
    }

    // Immediately sign in with the new credentials
    const supabase = getBrowserClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: signupEmail,
      password: signupPassword,
    });

    setSignupBusy(false);
    if (err) {
      setSignupError(`가입은 완료 · 자동 로그인 실패: ${err.message}`);
      setSignupInfo(
        data.created ? "신규 가입 완료" : "기존 계정 비밀번호 갱신 완료",
      );
      return;
    }

    setSignupOpen(false);
    router.push(next);
    router.refresh();
  }

  return (
    <>
      <div className="mx-auto mt-16 max-w-sm rounded-xl border border-neutral-800 bg-neutral-900/40 p-8">
        <h1 className="text-lg font-semibold">Sprint Radar 로그인</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {mode === "magic"
            ? "관리자 이메일로 Magic Link를 전송합니다."
            : "이메일 · 비밀번호로 즉시 로그인합니다."}
        </p>

        <div className="mt-4 flex gap-1 rounded-md border border-neutral-800 bg-neutral-950 p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode("magic")}
            className={`flex-1 rounded py-1.5 ${
              mode === "magic"
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Magic Link
          </button>
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`flex-1 rounded py-1.5 ${
              mode === "password"
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            비밀번호
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="text-xs uppercase tracking-wide text-neutral-500"
            >
              이메일
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
            />
          </div>

          {mode === "password" && (
            <div>
              <label
                htmlFor="password"
                className="text-xs uppercase tracking-wide text-neutral-500"
              >
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-md bg-neutral-100 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
          >
            {sending
              ? "처리 중..."
              : mode === "magic"
                ? "Magic Link 전송"
                : "로그인"}
          </button>
        </form>

        {message && <p className="mt-4 text-xs text-emerald-400">{message}</p>}
        {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

        <div className="mt-6 border-t border-neutral-800 pt-4 text-center text-xs text-neutral-500">
          계정이 없으신가요?{" "}
          <button
            type="button"
            onClick={() => {
              setSignupOpen(true);
              setSignupEmail(email);
              setSignupError(null);
              setSignupInfo(null);
            }}
            className="text-neutral-200 underline hover:text-white"
          >
            가입
          </button>
        </div>
      </div>

      {signupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <h2 className="text-base font-semibold">Radar 관리자 가입</h2>
              <button
                type="button"
                onClick={() => setSignupOpen(false)}
                className="text-neutral-500 hover:text-neutral-300"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              허용 이메일만 가입 가능 · 이미 있으면 비밀번호 갱신
            </p>

            <form onSubmit={onSignup} className="mt-5 space-y-3">
              <div>
                <label
                  htmlFor="signup-email"
                  className="text-xs uppercase tracking-wide text-neutral-500"
                >
                  이메일
                </label>
                <input
                  id="signup-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="text-xs uppercase tracking-wide text-neutral-500"
                >
                  비밀번호 (8자 이상)
                </label>
                <input
                  id="signup-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password2"
                  className="text-xs uppercase tracking-wide text-neutral-500"
                >
                  비밀번호 확인
                </label>
                <input
                  id="signup-password2"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={signupPassword2}
                  onChange={(e) => setSignupPassword2(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
                />
              </div>

              <button
                type="submit"
                disabled={signupBusy}
                className="mt-2 w-full rounded-md bg-neutral-100 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
              >
                {signupBusy ? "처리 중..." : "가입 · 자동 로그인"}
              </button>
            </form>

            {signupInfo && (
              <p className="mt-3 text-xs text-emerald-400">{signupInfo}</p>
            )}
            {signupError && (
              <p className="mt-3 text-xs text-red-400">{signupError}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto mt-16 max-w-sm text-neutral-400">로딩...</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
