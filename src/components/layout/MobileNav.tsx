"use client";

import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "#about", label: "About" },
  { href: "#products", label: "Products" },
  { href: "#services", label: "Services" },
  { href: "#contact", label: "Contact" },
];

const GITHUB_URL = "https://github.com/GONNIM";

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {open ? (
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
      >
        <HamburgerIcon open={open} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="모바일 메뉴"
        >
          <button
            type="button"
            aria-label="메뉴 닫기 (배경)"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div
            id="mobile-nav-panel"
            className="absolute right-0 top-0 flex h-full w-72 max-w-[85%] flex-col gap-1 border-l border-[color:var(--color-border)] bg-[color:var(--color-background)] p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-bold tracking-tight text-[color:var(--color-foreground)]">
                gonnim.dev
              </span>
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--color-muted-foreground)] transition-colors hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-foreground)]"
              >
                <HamburgerIcon open />
              </button>
            </div>

            <nav aria-label="모바일 주요 섹션" className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-base font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-surface)]"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="mt-auto flex flex-col gap-3 border-t border-[color:var(--color-border)] pt-6">
              <a
                href="#contact"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[color:var(--color-accent)] px-6 text-sm font-semibold text-[color:var(--color-accent-foreground)] shadow-sm"
              >
                상담 요청
                <span aria-hidden>→</span>
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 text-sm font-medium text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-border)]"
              >
                GitHub
                <span aria-hidden>↗</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
