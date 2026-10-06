"use client";

// 56차 C · 콘솔 공통 · 처리 중 상태 · 알림 띠(Toast) · 처리 중 이동 확인 · 화면 전환 진행 막대.
//
// - 처리 중 수: ActionButton 이 begin() 으로 올리고 끝나면 내린다. 0 이 아니면 "처리 중" 이다.
// - 알림 띠: 화면 맨 위 고정. 성공은 5초 뒤 사라지고, 실패는 「닫기」를 누를 때까지 남는다.
// - 처리 중에 링크를 누르면 confirm 「처리 중입니다. 끝난 뒤 이동하시겠습니까?」. 확인이면 끝난 뒤 그 주소로 간다.
//   창을 닫거나 새로 고치면 브라우저 기본 확인 창이 뜬다(beforeunload).
// - 진행 막대: 메뉴 링크는 Next.js useLinkStatus 의 pending 을 받고(NavPending), 그 밖의 안쪽 링크는
//   누른 때부터 주소가 바뀔 때까지 켠다.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLinkStatus } from "next/link";

export type ToastInput = { ok: boolean; text: string };
type Toast = ToastInput & { id: number };

type Ctx = {
  busy: boolean;
  begin: () => () => void;
  toast: (t: ToastInput) => void;
  setLinkPending: (key: string, pending: boolean) => void;
};

const ActionCtx = createContext<Ctx>({
  busy: false,
  begin: () => () => {},
  toast: () => {},
  setLinkPending: () => {},
});

export const useActionStatus = () => useContext(ActionCtx);

export const NAV_CONFIRM = "처리 중입니다. 끝난 뒤 이동하시겠습니까?";

export function ActionStatusProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  // 링크를 누른 때의 주소 · 주소가 바뀌면 진행 막대가 저절로 꺼진다(effect 없이 비교)
  const [navFrom, setNavFrom] = useState<string | null>(null);
  const [linkPending, setLinkPendingMap] = useState<Record<string, boolean>>({});
  const queuedHref = useRef<string | null>(null);

  const begin = useCallback(() => {
    countRef.current += 1;
    setCount(countRef.current);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      countRef.current = Math.max(0, countRef.current - 1);
      setCount(countRef.current);
    };
  }, []);

  const toast = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    if (t.ok) setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 5000);
  }, []);

  const setLinkPending = useCallback((key: string, pending: boolean) => {
    setLinkPendingMap((m) => (m[key] === pending ? m : { ...m, [key]: pending }));
  }, []);

  // 처리가 끝나면 미뤄 둔 이동을 한다
  useEffect(() => {
    if (count === 0 && queuedHref.current) {
      const href = queuedHref.current;
      queuedHref.current = null;
      router.push(href);
    }
  }, [count, router]);

  // 안쪽 링크 누름: 처리 중이면 확인 · 아니면 진행 막대 켜기
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const samePage = url.pathname === location.pathname && url.search === location.search;
      if (samePage && url.hash) return;
      if (countRef.current > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm(NAV_CONFIRM)) queuedHref.current = url.pathname + url.search + url.hash;
        return;
      }
      if (!samePage) setNavFrom(location.pathname);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 처리 중에 창을 닫거나 새로 고치면 브라우저 확인 창
  useEffect(() => {
    if (count === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [count]);

  // 진행 막대가 어떤 이유로 남으면 15초 뒤 끈다
  useEffect(() => {
    if (navFrom === null) return;
    const t = setTimeout(() => setNavFrom(null), 15000);
    return () => clearTimeout(t);
  }, [navFrom]);

  const clickNav = navFrom !== null && navFrom === pathname;
  const navigating = clickNav || Object.values(linkPending).some(Boolean);

  return (
    <ActionCtx.Provider value={{ busy: count > 0, begin, toast, setLinkPending }}>
      <TopBar on={navigating} />
      <ToastStack toasts={toasts} onClose={(id) => setToasts((all) => all.filter((x) => x.id !== id))} />
      {children}
    </ActionCtx.Provider>
  );
}

/** 화면 맨 위 얇은 진행 막대 */
function TopBar({ on }: { on: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`}
    >
      <div className="ds-topbar h-full w-1/3 bg-[color:var(--accent)]" />
      <style>{`@keyframes ds-topbar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}.ds-topbar{animation:ds-topbar 1.1s ease-in-out infinite}`}</style>
    </div>
  );
}

/** 알림 띠 · 화면 맨 위 가운데 고정 */
function ToastStack({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[55] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-toast={t.ok ? "ok" : "fail"}
          className={`pointer-events-auto flex max-w-2xl items-start gap-3 rounded-md border px-3 py-2 text-sm shadow-md ${
            t.ok
              ? "border-emerald-500/50 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              : "border-red-500/50 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
          }`}
        >
          <span className="min-w-0 flex-1 break-words">{t.text}</span>
          {!t.ok && (
            <button type="button" onClick={() => onClose(t.id)} className="shrink-0 rounded border border-current/30 px-1.5 text-xs">
              닫기
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** 메뉴 링크 안에 둔다 · Next.js useLinkStatus 의 pending 을 진행 막대로 보낸다 */
export function NavPending({ id }: { id: string }) {
  const { pending } = useLinkStatus();
  const { setLinkPending } = useActionStatus();
  useEffect(() => {
    setLinkPending(id, pending);
    return () => setLinkPending(id, false);
  }, [id, pending, setLinkPending]);
  return null;
}
